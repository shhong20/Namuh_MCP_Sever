import { mkdir, open, readFile, readdir, link, rm, lstat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Config } from "./config.js";
import { callRestPage } from "./client.js";
import { collectBrokerPages } from "./pagination.js";
import { liveAccount, currentSeoulDate } from "./history.js";
import { diagnoseNavComposition } from "./nav-composition.js";

export type NavCandidate = {
  schema_version: 1;
  date: string; captured_at: string; timezone: "Asia/Seoul";
  reported_net_assets_krw: number;
  reported_total_assets_krw: number;
  listed_asset_items_sum_krw: number;
  reconciliation_delta_krw: number;
  asset_item_count: number;
  page_count: number;
  pagination_codes: string[];
  pagination_complete: true;
  reconciliation_status: "DIFFERENCE_REQUIRES_REVIEW" | "ITEM_TOTAL_MATCHES";
  verified_full_nav: false;
  usable_for_investment_return: false;
  accounting_evidence?: {
    foreign_cash_krw: number | null;
    foreign_margin_krw: number | null;
    foreign_orderable_krw: number | null;
    foreign_cash_less_margin_and_orderable_krw: number | null;
    item_delta_less_foreign_margin_krw: number | null;
    asset_groups_krw: Record<string,{count:number;value_krw:number}>;
    classification: string;
  };
};
export function navCandidateDir(): string {
  return process.env.NAMUH_NAV_CANDIDATE_DIR ?? join(homedir(),".local","share","namuh-portfolio","nav-candidates");
}
async function privateDir() {
  const dir=navCandidateDir();
  await mkdir(dir,{recursive:true,mode:0o700});
  const st=await lstat(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
    throw new Error("NAV 후보 경로 접근권한이 안전하지 않습니다.");
  return dir;
}
function checkDate(date:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
     !Number.isFinite(Date.parse(date+"T00:00:00Z"))||
     new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)
    throw new Error("잘못된 NAV 기록일");
}
function numberOrFail(value:unknown,key:string):number{
  if(value===null||value===undefined||value===""||!Number.isFinite(Number(value)))
    throw new Error("NAV 항목 누락 또는 비정상: "+key);
  return Number(value);
}
export function makeNavCandidate(collected: Awaited<ReturnType<typeof collectBrokerPages>>,
 date=currentSeoulDate(), capturedAt=new Date().toISOString()):NavCandidate{
  checkDate(date);
  if(!collected.audit.complete)throw new Error("NAV 페이지 수집이 완료되지 않았습니다.");
  if(collected.audit.duplicate_rows!==0||collected.audit.page_count<1)
    throw new Error("중복 또는 무효 페이지가 포함되었습니다.");
  const summary=collected.data.Output_0??{};
  const nas=numberOrFail(summary.nas_amt,"nas_amt");
  const assets=numberOrFail(summary.tot_aet_amt,"tot_aet_amt");
  if(nas<=0||assets<=0)throw new Error("유효한 양수 NAV 후보가 없습니다.");
  let itemTotal=0;
  for(const [i,row] of collected.data.Output_1.entries()){
    itemTotal+=numberOrFail(row.eal_amt,"Output_1["+i+"].eal_amt");
  }
  const delta=Math.round((itemTotal-assets)*100)/100;
  const diagnostic=diagnoseNavComposition(summary,collected.data.Output_1,true);
  return {
    schema_version:1,date,captured_at:capturedAt,timezone:"Asia/Seoul",
    reported_net_assets_krw:nas,reported_total_assets_krw:assets,
    listed_asset_items_sum_krw:Math.round(itemTotal*100)/100,
    reconciliation_delta_krw:delta,
    asset_item_count:collected.data.Output_1.length,
    page_count:collected.audit.page_count,
    pagination_codes:[...collected.audit.codes],
    pagination_complete:true,
    reconciliation_status:Math.abs(delta)>1?"DIFFERENCE_REQUIRES_REVIEW":"ITEM_TOTAL_MATCHES",
    verified_full_nav:false,
    usable_for_investment_return:false,
    accounting_evidence: {
      foreign_cash_krw:diagnostic.broker_reported.foreign_cash_krw,
      foreign_margin_krw:diagnostic.broker_reported.foreign_margin_krw,
      foreign_orderable_krw:diagnostic.broker_reported.foreign_orderable_krw,
      foreign_cash_less_margin_and_orderable_krw:diagnostic.comparisons.foreign_cash_minus_margin_and_orderable_krw,
      item_delta_less_foreign_margin_krw:diagnostic.comparisons.listed_delta_minus_margin_krw,
      asset_groups_krw:diagnostic.group_values_krw,
      classification:diagnostic.diagnostic_status
    },
  };
}
export async function listNavCandidates(month?:string):Promise<NavCandidate[]>{
  if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error("월 YYYY-MM 형식 오류");
  let files:string[];
  try {
    const dir=navCandidateDir();
    const st=await lstat(dir);
    if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
      throw new Error("NAV 후보 디렉터리 권한 오류");
    files=await readdir(dir);
  }catch(e){
    if((e as NodeJS.ErrnoException).code==="ENOENT")return [];
    throw e;
  }
  const result:NavCandidate[]=[];
  for(const filename of files.filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f)&&(!month||f.startsWith(month+"-"))).sort()){
    const path=join(navCandidateDir(),filename);
    const st=await lstat(path);
    if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw new Error("NAV 후보 파일 권한 오류");
    const obj=JSON.parse(await readFile(path,"utf8")) as NavCandidate;
    if(obj.date+".json"!==filename||obj.schema_version!==1||obj.verified_full_nav!==false||
       obj.usable_for_investment_return!==false||obj.pagination_complete!==true||
       !Number.isFinite(obj.reported_net_assets_krw))
      throw new Error("NAV 후보 저장 데이터 무결성 오류");
    result.push(obj);
  }
  return result;
}
export async function saveNavCandidate(candidate:NavCandidate){
  if(candidate.verified_full_nav!==false||candidate.usable_for_investment_return!==false)
    throw new Error("검증된 NAV라고 기록할 수 없습니다");
  checkDate(candidate.date);
  const dir=await privateDir();
  const dest=join(dir,candidate.date+".json");
  const tmp=join(dir,".partial-"+randomUUID());
  const h=await open(tmp,"wx",0o600);
  try{await h.writeFile(JSON.stringify(candidate)+"\n");await h.sync();}finally{await h.close();}
  try{
    await link(tmp,dest);
    return {created:true,date:candidate.date};
  }catch(e){
    if((e as NodeJS.ErrnoException).code==="EEXIST")
      return {created:false,date:candidate.date};
    throw e;
  }finally{await rm(tmp,{force:true});}
}
export async function captureNavCandidate(config:Config) {
  const today=currentSeoulDate();
  const previous=(await listNavCandidates()).find(x=>x.date===today);
  if(previous)return {created:false,candidate:previous,broker_calls:0};
  const act_no=await liveAccount(config);
  const data=await collectBrokerPages((cts,flag)=>callRestPage(config,
    "/krstock/inquiry/v1/assetStatus",{
      act_no,eal_aly_cd:"2",aet_bse:"1",qut_dit_cd:"UNT",aly_qut_cd:"2"
    },cts,flag),12);
  if(!data.audit.complete)
    throw new Error("연속조회 불완전: "+String(data.audit.failure_reason));
  const candidate=makeNavCandidate(data,today);
  const saved=await saveNavCandidate(candidate);
  return {...saved,candidate,broker_calls:data.audit.page_count+1};
}
export async function navCandidateHistory(month?:string){
  const records=await listNavCandidates(month);
  return {
    observations:records.length,
    records,
    verified_nav_observations:0,
    investor_return_available:false,
    warning:"이 기록은 증권사가 보고한 전체 순자산 후보이며 현금·미결제·대출의 회계 처리와 외부 현금흐름이 검증되지 않았습니다. 변화율을 투자수익률로 계산하지 않습니다."
  };
}

import { mkdir, readdir, readFile, rename, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { callRest } from "./client.js";
import { summarizeBalances } from "./portfolio.js";
import type { Config } from "./config.js";

export const REPORT_TIMEZONE = "Asia/Seoul";
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
type Snapshot = {
  schema_version: 1; date: string; captured_at: string; timezone: string;
  scope: string; holdings_value_krw: number; holdings_pnl_krw: number;
  domestic_holdings_krw: number; us_holdings_krw: number;
  positions: Array<{ market:string; symbol:string; name:string; quantity:number; market_value_krw:number; unrealized_pnl_krw:number }>;
};
export function currentSeoulDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone:REPORT_TIMEZONE, year:"numeric", month:"2-digit", day:"2-digit" }).format(now);
}
export function assertMonth(month: string):void {
  if(!MONTH_PATTERN.test(month))throw new Error("월은 YYYY-MM 형식이어야 합니다.");
}
function assertDate(date:string):void {
  if(!DAY_PATTERN.test(date)||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)
    throw new Error("잘못된 날짜");
}
export function storeDirectory():string {
  return process.env.NAMUH_PORTFOLIO_SNAPSHOT_DIR ?? join(homedir(),".local","share","namuh-portfolio","snapshots");
}
async function ensurePrivateDir():Promise<string>{
  const dir=storeDirectory();
  await mkdir(dir,{recursive:true,mode:0o700});
  const fs=await import("node:fs/promises");
  const st=await fs.lstat(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode & 0o077)!==0)
    throw new Error("스냅샷 저장 경로의 권한이 안전하지 않습니다.");
  return dir;
}
function snapshotFilename(date:string){assertDate(date);return date+".json";}
export async function saveSnapshot(s:Snapshot):Promise<{created:boolean;date:string}>{
  const dir=await ensurePrivateDir();
  const dest=join(dir,snapshotFilename(s.date));
  const json=JSON.stringify(s)+"\n";
  // 'wx' creates a new private file only; no overwrite of a previously captured trading day.
  const tmp=join(dir,".capture-"+randomUUID());
  const f=await open(tmp,"wx",0o600);
  try{
    await f.writeFile(json,{encoding:"utf8"});
    await f.sync();
  }finally{await f.close();}
  try{
    // exclusive link prevents concurrent capture overwriting an existing snapshot
    const {link}=await import("node:fs/promises");
    await link(tmp,dest);
    return {created:true,date:s.date};
  }catch(e){
    if((e as NodeJS.ErrnoException).code==="EEXIST")return {created:false,date:s.date};
    throw e;
  }finally{await rm(tmp,{force:true});}
}
export async function listSnapshots(month?:string):Promise<Snapshot[]>{
  if(month)assertMonth(month);
  const dir=storeDirectory();
  try{
    const fs=await import("node:fs/promises");
    const st=await fs.lstat(dir);
    if(!st.isDirectory()||st.isSymbolicLink()||(st.mode & 0o077)!==0)
      throw new Error("스냅샷 디렉터리 권한 오류");
  }catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return []; throw e;}
  const files=(await readdir(dir)).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f)&&(!month||f.startsWith(month+"-"))).sort();
  const snapshots:Snapshot[]=[];
  for(const file of files){
    const p=join(dir,file),fs=await import("node:fs/promises");
    const st=await fs.lstat(p);
    if(!st.isFile()||st.isSymbolicLink()||(st.mode & 0o077)!==0)
      throw new Error("스냅샷 파일 보안 검증 실패");
    const s=JSON.parse(await readFile(p,"utf8")) as Snapshot;
    if(s.schema_version!==1||s.date+".json"!==file||!Number.isFinite(s.holdings_value_krw))
      throw new Error("스냅샷 데이터 무결성 오류");
    snapshots.push(s);
  }
  return snapshots;
}
export function createSnapshot(overview:ReturnType<typeof summarizeBalances>,date=currentSeoulDate(),at=new Date().toISOString()):Snapshot{
  assertDate(date);
  return {
    schema_version:1,date,captured_at:at,timezone:REPORT_TIMEZONE,
    scope:"KR_and_US_securities_only_no_cash",
    holdings_value_krw:overview.market_value_krw,
    holdings_pnl_krw:overview.position_unrealized_pnl_krw,
    domestic_holdings_krw:overview.domestic_securities_krw,
    us_holdings_krw:overview.us_securities_krw,
    positions:overview.positions.map(p=>({
      market:p.market,symbol:p.symbol,name:p.name,quantity:p.quantity,
      market_value_krw:p.market_value_krw,unrealized_pnl_krw:p.unrealized_pnl_krw
    }))
  };
}
export function summarizeHistory(snapshots:Snapshot[], month?:string){
  if(month)assertMonth(month);
  const ordered=[...snapshots].sort((a,b)=>a.date.localeCompare(b.date));
  const first=ordered[0],last=ordered[ordered.length-1];
  const valueChange=first&&last?last.holdings_value_krw-first.holdings_value_krw:null;
  return {
    observations:ordered.length,first_date:first?.date??null,last_date:last?.date??null,
    first_holdings_krw:first?.holdings_value_krw??null,
    last_holdings_krw:last?.holdings_value_krw??null,
    holdings_value_change_krw:valueChange,
    holdings_value_change_pct:first?.holdings_value_krw>0&&valueChange!==null
      ?Math.round(valueChange/first.holdings_value_krw*10000)/100:null,
    calculation_kind:"holdings_valuation_change_NOT_investment_return",
    warning:"매매·입출금·배당·환율·신규 납입 때문에 평가액 변화는 투자수익률이 아닙니다. 기간 시작/끝 스냅샷이 없다면 그 기간의 성과를 대표하지 않습니다.",
    series:ordered.map(s=>({date:s.date,value_krw:s.holdings_value_krw,domestic_krw:s.domestic_holdings_krw,us_krw:s.us_holdings_krw,pnl_krw:s.holdings_pnl_krw}))
  };
}
export async function liveAccount(config:Config):Promise<string>{
  const d=await callRest(config,"/n2/acctinfo",{});
  if(d.rsp_cd!=="00000")throw new Error("계좌 목록 조회 실패");
  const live=(d.Output_0??[]).filter((x:{acct_type?:string})=>x.acct_type==="01");
  if(live.length!==1||!live[0].acct_no)throw new Error("실계좌 1개를 식별할 수 없습니다");
  return live[0].acct_no;
}
export async function captureDaily(config:Config):Promise<{created:boolean;date:string;holdings_value_krw:number}>{
  const date=currentSeoulDate();
  // Do not call broker at all if this date is already captured.
  if((await listSnapshots()).some(s=>s.date===date)){
    const old=(await listSnapshots()).find(s=>s.date===date)!;
    return {created:false,date,holdings_value_krw:old.holdings_value_krw};
  }
  const account=await liveAccount(config);
  const domestic=await callRest(config,"/krstock/inquiry/v1/balance",{
    act_no:account,bnc_bse_cd:"5",ltg_aot_dit_cd:"9",aet_bse:"1",qut_dit_cd:"UNT",aly_qut_cd:"2"
  });
  const overseas=await callRest(config,"/gbstock/inquiry/v1/balance",{
    act_no:account,qut_iqr_dit_cd:"9",fc_sec_trd_nat_cd:"200",cur_cd:"KRW",xns_dit_cd:"1"
  });
  if(!["00166","13578"].includes(domestic.rsp_cd)||!["00166","13578"].includes(overseas.rsp_cd))
    throw new Error("잔고 API 업무 상태 불확실 — 스냅샷 저장하지 않음");
  const s=createSnapshot(summarizeBalances(domestic,overseas),date);
  const result=await saveSnapshot(s);
  return {...result,holdings_value_krw:s.holdings_value_krw};
}
export function monthDates(month:string):{start:string;end:string}{
  assertMonth(month);
  const [year,mm]=month.split("-").map(Number);
  const last=new Date(Date.UTC(year,mm,0)).getUTCDate();
  return {start:month.replace("-","")+"01",end:month.replace("-","")+String(last).padStart(2,"0")};
}
export function summarizeDividends(records:any[]){
  const dividendRows=records.filter(r=>/배당금입금|배당금 입금|dividend/i.test(String(r.sps_cd_nm??"")+" "+String(r.act_trd_tp_nm??"")));
  const currencyTotals:Record<string,number>={};
  const bySymbol:Record<string,{symbol:string;name:string;currency:string;amount:number;count:number}>={};
  for(const r of dividendRows){
    const currency=String(r.cur_cd_nm??"USD");
    // do not invent KRW conversions; broker FX can vary between transactions.
    const amount=Number(r.fc_trd_amt);
    if(!Number.isFinite(amount)||amount<0)continue;
    currencyTotals[currency]=(currencyTotals[currency]??0)+amount;
    const symbol=String(r.iem_cd??r.oss_iem_cd??"unknown");
    const key=symbol+"|"+currency;
    const o=bySymbol[key]??{symbol,name:String(r.iem_krl_nm??r.oss_iem_nm??""),currency,amount:0,count:0};
    o.amount+=amount;o.count++;bySymbol[key]=o;
  }
  return {transaction_count:dividendRows.length,amounts_by_currency:currencyTotals,
    by_symbol:Object.values(bySymbol).sort((a,b)=>b.amount-a.amount),
    note:"증권사 거래내역에 실제 기록된 배당 입금액입니다. 세전 총배당과 다를 수 있으며 거래내역 누락/페이지네이션 시 부분 결과입니다."};
}

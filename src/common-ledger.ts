import type { Config } from "./config.js";
import { callRestPage, type BrokerPage } from "./client.js";
import { liveAccount, monthDates, currentSeoulDate } from "./history.js";

type SourceRow = Record<string,unknown>;
type PageResult = {
  rows:SourceRow[];
  audit:{
    complete:boolean; page_count:number; row_count:number; duplicate_count:number;
    response_codes:string[]; failure_reason:string|null;
  };
};
const VALID_MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
function numberMaybe(v:unknown):number|null {
  if(v===null||v===undefined||v==="")return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function pageRowSignature(row:SourceRow):string {
  // Source IDs are not guaranteed. Exact repeats across pages are unsafe,
  // but legitimate identical transactions can exist; stop rather than silently discard.
  return JSON.stringify(row);
}
export async function collectCommonPages(
  fetchPage:(cts?:string,ctsFlag?:string)=>Promise<BrokerPage>,
  limit=12,
):Promise<PageResult>{
  if(!Number.isInteger(limit)||limit<1||limit>30)throw Error("잘못된 페이지 한도");
  let token:string|undefined,flag:string|undefined,done=false,failure_reason:string|null=null;
  const seenCursor=new Set<string>(),seenRow=new Set<string>();
  const rows:SourceRow[]=[],response_codes:string[]=[];
  let duplicates=0;
  for(let i=0;i<limit;i++){
    const page=await fetchPage(token,flag);
    const body=page.data??{};
    const code=String(body.rsp_cd??"");
    response_codes.push(code);
    const batch=Array.isArray(body.Output_0)?body.Output_0:[];
    for(const row of batch){
      if(row===null||typeof row!=="object"||Array.isArray(row)){
        failure_reason="invalid_transaction_row";break;
      }
      const fingerprint=pageRowSignature(row);
      if(seenRow.has(fingerprint))duplicates++;
      else seenRow.add(fingerprint);
      rows.push(row);
    }
    if(failure_reason)break;
    if(code==="00166"||code==="13578"){
      // Some broker responses carry cts even when flag=N; terminal code wins.
      done=true;break;
    }
    if(code!=="00218"){failure_reason="unexpected_broker_result";break;}
    if(!page.continuation?.cts||page.continuation.flag!=="Y"){
      failure_reason="missing_or_invalid_continuation";break;
    }
    if(seenCursor.has(page.continuation.cts)){
      failure_reason="cursor_reused";break;
    }
    seenCursor.add(page.continuation.cts);
    token=page.continuation.cts;
    flag=page.continuation.flag;
    if(i===limit-1)failure_reason="page_limit";
  }
  if(duplicates){done=false;failure_reason="duplicate_rows_unresolved";}
  return {rows,audit:{
    complete:done,page_count:response_codes.length,row_count:rows.length,
    duplicate_count:duplicates,response_codes,failure_reason
  }};
}

export function redactedCommonRows(rows:SourceRow[], source:"deposit"|"transactions"){
  return rows.map(row=>{
    const label=String(row.sps_cd_krl_anm??"");
    const transactionType=source==="deposit"?String(row.act_trd_tp_nm??""):"";
    const rawCurrency=source==="transactions"?String(row.cur_cd??""):"";
    const currency=/^[A-Z]{3}$/.test(rawCurrency)?rawCurrency:"UNSPECIFIED";
    // No name fields, account identifiers, customer references, or raw notes.
    return {
      date:String(row.trd_dt??""),actual_date:String(row.ral_trd_dt??""),
      currency,amount:numberMaybe(row.trd_amt),
      transaction_type:transactionType,
      description:label,
      direction_candidate:source==="deposit"?(/입금/.test(transactionType)?"in":
        /출금/.test(transactionType)?"out":"unknown"):"unknown",
      // Cash movements in a securities account can be internal transfers or
      // settlements. NEVER infer they are external investor contributions.
      externally_verified:false
    };
  });
}

export function summarizeCommonLedger(
  deposits:PageResult,transactions:PageResult,month:string
){
  const normalizedDeposits=redactedCommonRows(deposits.rows,"deposit");
  const normalizedTransactions=redactedCommonRows(transactions.rows,"transactions");
  const ambiguous=normalizedDeposits.filter(r=>r.direction_candidate==="unknown");
  return {
    month,
    sources:{deposit_withdrawal:deposits.audit,comprehensive_transactions:transactions.audit},
    cash_movements:normalizedDeposits,
    comprehensive_transactions:normalizedTransactions,
    counts:{
      deposit_withdrawal:normalizedDeposits.length,
      comprehensive_transactions:normalizedTransactions.length,
      candidate_inflows:normalizedDeposits.filter(r=>r.direction_candidate==="in").length,
      candidate_outflows:normalizedDeposits.filter(r=>r.direction_candidate==="out").length,
      unclear_direction:ambiguous.length,
    },
    all_source_pages_complete:deposits.audit.complete&&transactions.audit.complete,
    externally_verified:false,
    verified_net_external_flow_krw:null,
    ready_for_portfolio_return:false,
    warnings:[
      "입출금 조회의 입금·출금은 고객 외부 자금 유입/유출과 일치하지 않을 수 있습니다. 계좌 간 대체, 환전, 내부 이체 구분의 정본 확인이 필요합니다.",
      "입출금내역은 통화코드가 명시되지 않아 통화를 UNSPECIFIED로 표시합니다. 원화로 임의 환산하거나 금액을 합산하지 않습니다.",
      "거래 상대방·고객명·계좌번호 등 개인정보는 결과에서 제외합니다.",
      "전체 계좌 순자산의 기초/기말과 모든 계좌 외부 자금흐름을 검증하기 전에는 실제 투자수익률을 계산하지 않습니다.",
    ]
  };
}

export async function monthlyCommonLedger(config:Config,month:string,maxPages=12){
  if(!VALID_MONTH.test(month))throw Error("조회월은 YYYY-MM 형식이어야 합니다.");
  const {start,end}=monthDates(month);
  const today=currentSeoulDate().replaceAll("-","");
  if(start>today)throw Error("미래 월은 조회하지 않습니다.");
  const account=await liveAccount(config);
  const endDate=end>today?today:end;
  // Sequentially invoke broker; no automatic 429 retry.
  const deposits=await collectCommonPages(
    (cts,flag)=>callRestPage(config,"/common/inquiry/v1/depositWithdrawal",{
      iqr_tp_cd:"1",act_no:account,iqr_sta_dt:start,iqr_end_dt:endDate,act_trd_dtl_cd:"01"
    },cts,flag),maxPages);
  const transactions=await collectCommonPages(
    (cts,flag)=>callRestPage(config,"/common/inquiry/v1/totalTransaction",{
      iqr_tp_cd:"1",iqr_rge_cd:"2",act_no:account,iqr_sta_dt:start,
      iqr_end_dt:endDate,iem_llf_cd:"00",act_trd_dtl_cd:"00"
    },cts,flag),maxPages);
  return summarizeCommonLedger(deposits,transactions,month);
}

import { callRest } from "./client.js";
import type { Config } from "./config.js";
import { liveAccount, monthDates, summarizeDividends } from "./history.js";

/** Broker reporting codes are operation-specific. Never treat unknown codes as empty success. */
const RESPONSES: Record<string, Set<string>> = {
  domesticRealized: new Set(["00166","11512"]),
  overseasRealized: new Set(["00166","13578"]),
  foreignTransactions: new Set(["00166","13578"]),
};
export function verifyBrokerResponse(data: any, operation:keyof typeof RESPONSES):void {
  if(!RESPONSES[operation].has(String(data?.rsp_cd)))
    throw new Error("증권사 "+operation+" 조회 실패: "+String(data?.rsp_cd??"no_code")+" "+String(data?.rsp_msg??""));
}
function finiteOrNull(v:unknown):number|null {
  if(v===undefined||v===null||v==="")return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
export function realizedSummary(domestic:any, foreign:any){
  const krw=finiteOrNull(domestic?.Output_0?.pls_amt_sum);
  const usd=finiteOrNull(foreign?.Output_0?.fc_rzt_pls_sum);
  const domesticRecords=(domestic?.Output_1??[]).map((r:any)=>({
    date:r.sby_dt, buy_krw:finiteOrNull(r.byn_amt), sell_krw:finiteOrNull(r.sll_amt), realized_pnl_krw:finiteOrNull(r.pls_amt),
  }));
  const foreignRecords=(foreign?.Output_1??[]).map((r:any)=>({
    order_date:r.orr_dt, currency:r.trd_cur_cd, buy_quantity:finiteOrNull(r.byn_qty),
    sell_quantity:finiteOrNull(r.sll_qty), realized_pnl_usd:finiteOrNull(r.fc_rzt_pls),
  }));
  return {
    domestic_realized_krw:krw, foreign_realized_usd:usd,
    domestic_daily_records:domesticRecords,
    foreign_daily_records:foreignRecords,
    foreign_krw_realized:null,
    note:"국내 실현손익과 해외 USD 실현손익은 서로 다른 통화로 합산하지 않습니다. 원화 환산 실현손익은 검증된 원화 응답이 없으면 null입니다. 배당은 별도로 집계하며 미실현손익과도 구분합니다.",
  };
}
export function cashFlowClassifications(records:any[]){
  const summary={security_buys:0,security_sells:0,dividend_deposits:0,
    explicit_external_deposits:0,explicit_external_withdrawals:0,unclassified:0};
  for(const r of records){
    const label=String(r.sps_cd_nm??"");
    if(/배당금입금/.test(label))summary.dividend_deposits++;
    else if(/증권매수/.test(label))summary.security_buys++;
    else if(/증권매도/.test(label))summary.security_sells++;
    else if(/^(원화|외화)?(입금|출금)$/.test(label)&&!/(배당|매매)/.test(label)){
      if(/입금/.test(label))summary.explicit_external_deposits++;
      else summary.explicit_external_withdrawals++;
    }else summary.unclassified++;
  }
  return {
    ...summary,
    warning:"매수·매도·배당은 계좌 내부 거래이며 외부 납입/인출로 분류하지 않습니다. 분류 불명 거래가 있거나 국내·해외 계좌 간 자금 이동이 불명확하면 현금흐름 기반 전체 수익률은 산출할 수 없습니다.",
  };
}
export function modifiedDietz(args:{
  opening_nav_krw:number;closing_nav_krw:number;
  flows:{day_offset:number;external_flow_krw:number}[];
  total_days:number;verified_full_account_nav:boolean;complete_external_flows:boolean;
}){
  const {opening_nav_krw,closing_nav_krw,flows,total_days,verified_full_account_nav,complete_external_flows}=args;
  if(!verified_full_account_nav||!complete_external_flows)
    return {available:false,rate_pct:null,reason:"검증된 전체 순자산(현금 포함) 또는 외부 입출금 내역이 불완전합니다."};
  if(!(total_days>0&&Number.isInteger(total_days)&&opening_nav_krw>=0&&closing_nav_krw>=0&&
    Number.isFinite(opening_nav_krw)&&Number.isFinite(closing_nav_krw)))
    throw new Error("평가액·기간 값이 유효하지 않습니다.");
  if(flows.some(f=>!Number.isInteger(f.day_offset)||f.day_offset<0||f.day_offset>total_days||!Number.isFinite(f.external_flow_krw)))
    throw new Error("현금흐름 시점·금액이 잘못되었습니다.");
  const netFlow=flows.reduce((sum,f)=>sum+f.external_flow_krw,0);
  const weighted=flows.reduce((sum,f)=>sum+f.external_flow_krw*(total_days-f.day_offset)/total_days,0);
  const profit=closing_nav_krw-opening_nav_krw-netFlow;
  const denominator=opening_nav_krw+weighted;
  if(denominator<=0)return {available:false,rate_pct:null,reason:"수익률 분모가 0 이하입니다."};
  return {
    available:true,method:"Modified Dietz estimate",rate_pct:Math.round(profit/denominator*10000)/100,
    gain_krw:Math.round(profit),opening_nav_krw,closing_nav_krw,
    net_external_flow_krw:netFlow,weighted_external_flow_krw:weighted,
    note:"검증된 평가액과 외부 입출금이 완전하다는 전제하에 구한 근사 수익률입니다. 시가평가 시점 차이·수수료·정산 영향 및 당일 내 유입시점은 반영되지 않을 수 있어 정확한 시간가중수익률(TWR)이 아닙니다.",
  };
}
function firstToday(day:string):string{
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replaceAll("-","");
  return day>today?today:day;
}
async function reportRaw(config:Config,start:string,end:string){
  const account=await liveAccount(config);
  // Sequential calls preserve NH rate limit and avoid bulk retry storms.
  const domestic=await callRest(config,"/krstock/inquiry/v1/dailyPnl",{act_no:account,iqr_sta_dt:start,iqr_end_dt:end});
  verifyBrokerResponse(domestic,"domesticRealized");
  const foreign=await callRest(config,"/gbstock/inquiry/v1/periodPnl",{
    act_no:account,iqr_dit:"1",sta_orr_dt:start,end_orr_dt:end,fc_sec_trd_nat_cd:"200",trd_cur_cd:"USD"
  });
  verifyBrokerResponse(foreign,"overseasRealized");
  const transactions=await callRest(config,"/gbstock/inquiry/v1/dailyTransaction",{
    act_no:account,iqr_sta_dt:start,iqr_end_dt:end,act_trd_cfc_cd:"00",iem_mlf_cd:"00001"
  });
  verifyBrokerResponse(transactions,"foreignTransactions");
  return {domestic,foreign,transactions};
}
export async function monthlyPerformance(config:Config,month:string){
  const {start,end}=monthDates(month);
  const actualEnd=firstToday(end);
  if(start>actualEnd)throw new Error("미래 월은 조회할 수 없습니다.");
  const {domestic,foreign,transactions}=await reportRaw(config,start,actualEnd);
  const rows=Array.isArray(transactions.Output_0)?transactions.Output_0:[];
  return {
    month,period:{start,end:actualEnd},
    realized:realizedSummary(domestic,foreign),
    dividends:summarizeDividends(rows),
    transaction_breakdown:cashFlowClassifications(rows),
    brokerage_codes:{domestic:domestic.rsp_cd,foreign:foreign.rsp_cd,transactions:transactions.rsp_cd},
    broker_transaction_rows:rows.length,
    monthly_total_return_pct:null,
    return_unavailable_reason:"기존 증권 보유액 스냅샷은 예수금과 외부 현금흐름을 포함하지 않으며, 전체 계좌 순자산의 기간 시작·끝 기록과 완전한 외부 입출금 원장이 검증되지 않았습니다.",
    report_complete:false,
    completeness_note:"증권사 조회 결과는 부분 페이지일 수 있으며 국내 배당·원화/외화 계좌간 이체 기록은 포함하지 않습니다. 수익률을 임의로 계산하지 않습니다."
  };
}
export async function annualDividendSummary(config:Config,year:number){
  const currentYear=Number(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric"}).format(new Date()));
  if(!Number.isInteger(year)||year<2000||year>currentYear)throw new Error("지원하지 않는 연도입니다.");
  const start=String(year)+"0101";
  const last=firstToday(String(year)+"1231");
  const account=await liveAccount(config);
  const data=await callRest(config,"/gbstock/inquiry/v1/dailyTransaction",{
    act_no:account,iqr_sta_dt:start,iqr_end_dt:last,act_trd_cfc_cd:"00",iem_mlf_cd:"00001"
  });
  verifyBrokerResponse(data,"foreignTransactions");
  const rows=Array.isArray(data.Output_0)?data.Output_0:[];
  const byMonth:Record<string,any[]>={};
  for(const r of rows) {
    const dt=String(r.trd_dt??"");
    if(!/^\d{8}$/.test(dt))continue;
    const month=dt.slice(0,4)+"-"+dt.slice(4,6);
    (byMonth[month]??=[]).push(r);
  }
  return {
    year,broker_code:data.rsp_cd,transaction_rows:rows.length,
    dividends:summarizeDividends(rows),
    months:Object.entries(byMonth).sort(([a],[b])=>a.localeCompare(b)).map(([month,records])=>({month,...summarizeDividends(records)})),
    complete:false,
    warning:"이 결과는 증권사가 응답한 첫 거래내역 집합 기준이며, 모든 연간 거래가 반환됐다는 페이지네이션 증거가 없습니다. 누적 배당은 관측된 거래액에 한정합니다."
  };
}

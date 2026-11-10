/** Read-only annual broker PnL evidence audit.
 * This is NOT a Korean capital-gains tax calculation.
 * Report raw operation status, bounded continuation, and missing evidence.
 */
import type { BrokerPage } from "./client.js";

export type AuditStatus = "NO_ROWS_REPORTED" | "OBSERVED_RECORDS" | "INCOMPLETE";
export interface MonthAudit {
  month:string; status:AuditStatus; page_count:number; row_count:number;
  response_codes:string[]; continuation_seen:boolean; failure_reason:string|null;
}
export function auditBrokerPeriodPage(page:BrokerPage, seenRows:Set<string>, codes:string[], pageNumber:number) {
  const d=page.data??{};
  const code=String(d.rsp_cd??"");
  codes.push(code);
  if (!Array.isArray(d.Output_1))return {state:"FAIL",reason:"OUTPUT_ROWS_NOT_ARRAY",rows:0,code};
  const rows=d.Output_1;
  for (const row of rows){
    const key=JSON.stringify(row);
    if(seenRows.has(key))return {state:"FAIL",reason:"DUPLICATE_RECORD",rows:rows.length,code};
    seenRows.add(key);
  }
  // The codes are operation-specific: 13578 means no data, never verified annual zero gain.
  if (code==="13578") {
    if(rows.length>0 || pageNumber>1)return {state:"FAIL",reason:"NO_DATA_CODE_WITH_ROWS",rows:rows.length,code};
    return {state:"END_EMPTY",reason:null,rows:0,code};
  }
  if (code==="00166") {
    if(page.continuation?.flag==="Y")return {state:"FAIL",reason:"TERMINAL_CODE_WITH_CONTINUATION_FLAG",rows:rows.length,code};
    return {state:"END_ROWS",reason:null,rows:rows.length,code};
  }
  if (code==="00218")return {state:"CONTINUE",reason:null,rows:rows.length,code};
  return {state:"FAIL",reason:"UNKNOWN_BROKER_CODE",rows:rows.length,code};
}
export async function auditMonthlyBrokerEvidence(
  month:string,
  fetchPage:(cts?:string,flag?:string)=>Promise<BrokerPage>,
  maxPages=8
):Promise<MonthAudit>{
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!Number.isInteger(maxPages)||maxPages<1||maxPages>12)
    throw new Error("INVALID_AUDIT_ARGUMENTS");
  const codes:string[]=[];const seenRows=new Set<string>();const seenCursors=new Set<string>();
  let cursor:string|undefined,flag:string|undefined,numberOfRows=0,continuation=false;
  for(let i=1;i<=maxPages;i++){
    const page=await fetchPage(cursor,flag);
    const state=auditBrokerPeriodPage(page,seenRows,codes,i);
    numberOfRows+=state.rows;
    if(state.state==="FAIL")return {month,status:"INCOMPLETE",page_count:i,row_count:numberOfRows,
      response_codes:codes,continuation_seen:continuation,failure_reason:state.reason};
    if(state.state==="END_EMPTY"||state.state==="END_ROWS"){
      return {month,status:state.state==="END_EMPTY"?"NO_ROWS_REPORTED":"OBSERVED_RECORDS",
        page_count:i,row_count:numberOfRows,response_codes:codes,
        continuation_seen:continuation,failure_reason:null};
    }
    continuation=true;
    if(!page.continuation?.cts || seenCursors.has(page.continuation.cts)){
      return {month,status:"INCOMPLETE",page_count:i,row_count:numberOfRows,response_codes:codes,
        continuation_seen:continuation,failure_reason:!page.continuation?.cts?"CONTINUATION_MISSING":"CONTINUATION_REPEATED"};
    }
    seenCursors.add(page.continuation.cts);
    cursor=page.continuation.cts;flag=page.continuation.flag??undefined;
  }
  return {month,status:"INCOMPLETE",page_count:maxPages,row_count:numberOfRows,
    response_codes:codes,continuation_seen:continuation,failure_reason:"MAX_PAGES"};
}
export function summarizeAnnualEvidence(year:number,monthly:MonthAudit[]) {
  return {
    year,mode:"READ_ONLY_ANNUAL_BROKER_EVIDENCE_AUDIT",
    months:monthly,total_observed_rows:monthly.reduce((sum,x)=>sum+x.row_count,0),
    incomplete_months:monthly.filter(x=>x.status==="INCOMPLETE").map(x=>x.month),
    no_rows_reported_months:monthly.filter(x=>x.status==="NO_ROWS_REPORTED").map(x=>x.month),
    broker_months_reviewed:monthly.length,
    broker_account_yearly_ledger_complete_verified:false,
    all_brokers_reconciled:false,
    tax_basis_krw_realized_verified:false,
    capital_gain_tax_amount_krw:null,
    basic_deduction_remaining_krw:null,
    orders_submitted:false,
    warning:"No rows reported by a period PnL endpoint is not proof of zero annual realized gain; execution-date FX, basis, fees, other brokers and filing treatment remain unverified."
  };
}
export function quoteCrosscheck(p:{
 symbol:string;quantity:number;broker_market_value_krw:number;last_price_krw:unknown;
 quote_code:string;quote_timestamp:string|null
}) {
 const price=Number(p.last_price_krw);
 if(!/^(?:\d{6}|\d{4}[A-Z]\d)$/.test(p.symbol)||!Number.isSafeInteger(p.quantity)||p.quantity<=0
   ||!Number.isFinite(p.broker_market_value_krw)||p.broker_market_value_krw<0)
   return {ok:false,reason:"INVALID_BROKER_POSITION"};
 if(p.quote_code!=="00000"||!Number.isFinite(price)||price<=0)
   return {ok:false,reason:"QUOTE_NOT_VERIFIED",symbol:p.symbol};
 return {
   ok:true,symbol:p.symbol,quantity:p.quantity,broker_market_value_krw:p.broker_market_value_krw,
   observed_quote_krw:price,
   indicative_market_value_krw:Math.round(price*p.quantity),
   quote_timestamp:p.quote_timestamp,
   valuation_mismatch:p.broker_market_value_krw!==Math.round(price*p.quantity),
   is_separate_price_not_broker_valuation:true,
   broker_market_value_replaced:false,
   buy_or_sell_trigger:false
 };
}

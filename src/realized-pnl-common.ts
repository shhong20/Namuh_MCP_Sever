/** Unified NH stock PnL API released 2026-11-19; read-only, currency-scoped. */
export type PnlMarket="KR"|"US";
type PnlCurrency="KRW"|"USD";
const KNOWN_CODES=new Set(["00166","13578","00218"]);

export function commonPeriodInput(account:string,start:string,end:string,market:PnlMarket,currency:PnlCurrency) {
  if(!/^\d{11}$/.test(account)||!/^\d{8}$/.test(start)||!/^\d{8}$/.test(end)||start>end)
    throw new Error("COMMON_PNL_INVALID_ACCOUNT_OR_DATES");
  if((market==="KR"&&currency!=="KRW")||(market==="US"&&currency!=="USD"))
    throw new Error("COMMON_PNL_MARKET_CURRENCY_MISMATCH");
  return {
    act_no:account,iqr_sta_dt:start,iqr_end_dt:end,
    bnc_tp_cd:"0",dmt_ose_dit_cd:market==="KR"?"1":"2",
    iqr_dit:currency==="KRW"?"2":"1",fc_sec_trd_nat_cd:market==="KR"?"000":"200",
    cur_cd:market==="KR"?"000":"USD"
  };
}

function amount(value:unknown):number|null {
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
export function normalizeCommonPeriod(data:any,market:PnlMarket) {
  const code=String(data?.rsp_cd??"");
  if(!KNOWN_CODES.has(code))throw new Error("COMMON_PNL_BROKER_CODE_NOT_VERIFIED");
  if(data?.Output_0!=null && !Array.isArray(data.Output_0))
    throw new Error("COMMON_PNL_ROWS_NOT_ARRAY");
  const rows:Array<any>=data?.Output_0??[];
  if(code==="13578" && rows.length)throw new Error("COMMON_PNL_NO_DATA_WITH_ROWS");
  if(code==="00166"&&(!data?.Output_1||typeof data.Output_1!=="object"||Array.isArray(data.Output_1)))
    throw new Error("COMMON_PNL_MISSING_AGGREGATE");
  const currency=market==="KR"?"KRW":"USD";
  for(const row of rows){
    if(!row||typeof row!=="object"||row.cur_cd!==currency||!/^\d{8}$/.test(String(row.orr_dt??"")))
      throw new Error("COMMON_PNL_ROW_CURRENCY_OR_DATE_MISMATCH");
    if(amount(row.rzt_pls_amt)===null)
      throw new Error("COMMON_PNL_ROW_REALIZED_MISSING");
  }
  const rawTotal=data?.Output_1?.fc_rzt_pls_sum;
  const total=amount(rawTotal);
  if(code==="00166"&&total===null)throw new Error("COMMON_PNL_MISSING_REALIZED_SUM");
  return {
    market,currency,broker_code:code,
    records:rows,reported_realized:total,
    first_page_only:true,broker_full_period_verified:false,
    note:"Broker first response only; pagination, source currency and cost basis need independent audit before tax or full-return use."
  };
}

/** Read-only tax-harvest screening: no tax allowance inference from position P&L. */
export interface UsTaxPosition {
  market: string; symbol: string; name: string; quantity: number;
  market_value_krw: number; unrealized_pnl_krw: number;
}
export function classifyTaxReadiness(positions:UsTaxPosition[], yearly:any, year:number) {
  if(!Array.isArray(positions)||!Number.isInteger(year)||year<2000||year>2100)
    return {ok:false,reason:"INVALID_INPUT"};
  const rows=[];
  const seen=new Set<string>();
  for(const p of positions.filter(x=>x.market==="US")){
    if(!p||!/^[A-Z0-9.\-]{1,15}$/.test(p.symbol)||seen.has(p.symbol)
      ||!Number.isFinite(p.quantity)||p.quantity<0
      ||!Number.isFinite(p.market_value_krw)||p.market_value_krw<0
      ||!Number.isFinite(p.unrealized_pnl_krw))
      return {ok:false,reason:"INVALID_OR_DUPLICATE_POSITION"};
    seen.add(p.symbol);
    rows.push({
      symbol:p.symbol,name:p.name,quantity:p.quantity,
      market_value_krw:p.market_value_krw,
      unrealized_pnl_krw:p.unrealized_pnl_krw,
      direction:p.unrealized_pnl_krw>0?"UNREALIZED_GAIN":p.unrealized_pnl_krw<0?"UNREALIZED_LOSS":"FLAT",
      tax_realized_gain_verified:false
    });
  }
  const profitable=rows.filter(x=>x.direction==="UNREALIZED_GAIN");
  const losing=rows.filter(x=>x.direction==="UNREALIZED_LOSS");
  // Yearly foreign gain cannot be certified without all pages, dates,
  // execution exchange rates, costs and all-broker reconciliation.
  const code=String(yearly?.rsp_cd??"");
  const brokerAccepted=["00166","13578"].includes(code);
  const rawPnl=yearly?.Output_0?.fc_rzt_pls_sum;
  const reportedUsd=rawPnl!==undefined&&rawPnl!==null&&rawPnl!==""&&Number.isFinite(Number(rawPnl))
    ?Number(rawPnl):null;
  return {
    ok:true,year,mode:"READ_ONLY_TAX_SCREEN",
    source:"NH current securities and broker period PnL first response",
    broker_yearly_query_ok:brokerAccepted,
    broker_code:code||null,
    broker_reported_yearly_realized_raw_first_response:brokerAccepted?reportedUsd:null,
    broker_period_pnl_currency_verified:false,
    broker_yearly_page_complete_verified:false,
    all_brokers_reconciled:false,
    tax_basis_krw_realized_verified:false,
    tax_free_allowance_remaining_krw:null,
    tax_deduction_reference_krw:2500000,
    realized_taxable_gain_krw:null,
    potential_unrealized_gains_krw:profitable.reduce((s,r)=>s+r.unrealized_pnl_krw,0),
    potential_unrealized_losses_krw:losing.reduce((s,r)=>s+r.unrealized_pnl_krw,0),
    gain_candidates:profitable.sort((a,b)=>b.unrealized_pnl_krw-a.unrealized_pnl_krw),
    loss_candidates:losing.sort((a,b)=>a.unrealized_pnl_krw-b.unrealized_pnl_krw),
    orders_submitted:false,
    warnings:[
      "Broker-position unrealized P&L is not annual realized taxable capital gain.",
      "The KRW tax basis requires all executed sales, acquisition prices, execution-date FX and fees, across all brokers.",
      "A broker response showing zero results does not prove annual realized profit equals zero.",
      "The 2.5m KRW deduction is a statutory reference, NOT a verified remaining allowance.",
      "The tool never places or authorizes any buy, sell, or repurchase orders."
    ]
  };
}
export function classifyDailyCandle(symbol:string, candles:any[], asOf:string) {
  if(!/^[A-Z0-9.\-]{1,15}$/.test(symbol)||!/^\d{8}$/.test(asOf)||!Array.isArray(candles))
    return {symbol,status:"INVALID_CANDLE",candle_date:null};
  const latest=candles.find(r=>r?.trade_date===asOf);
  if(!latest)return {symbol,status:"DATE_NOT_AVAILABLE",candle_date:null};
  const open=Number(latest.open_prc),close=Number(latest.close_prc);
  if(!(Number.isFinite(open)&&Number.isFinite(close)&&open>0&&close>0))
    return {symbol,status:"INVALID_CANDLE",candle_date:asOf};
  return {
    symbol,status:close>open?"BULLISH":close<open?"BEARISH":"DOJI",
    candle_date:asOf,open_usd:open,close_usd:close,
    candle_change_pct:Math.round((close/open-1)*10000)/100
  };
}

/** NH HTTP 429 or business-level "APP call count exceeded": stop remaining quotes. */
export function quoteRateLimitReached(responseOrError:unknown):boolean {
  if(responseOrError && typeof responseOrError==="object") {
    const x=responseOrError as {rsp_cd?:unknown;rsp_msg?:unknown;detail?:{category?:string;status?:number}};
    if(x.detail?.category==="rate_limit" || x.detail?.status===429) return true;
    return /(?:거래건수|호출|요청).*초과|(?:limit|throttl|rate.?limit)/i.test(String(x.rsp_msg??""));
  }
  return /(?:거래건수|호출|요청).*초과|(?:limit|throttl|rate.?limit)/i.test(String(responseOrError??""));
}

/** Explain missing/zero valuations; never silently treat suspicious holdings as valueless. */
export function inspectPositionIntegrity(positions:Array<{
  market:string;symbol:string;name:string;quantity:number;
  market_value_krw:number;unrealized_pnl_krw:number;
}>) {
 const alerts=[];
 const seen=new Set<string>();
 for (const p of positions) {
  const key=p.market+":"+p.symbol;
  if(seen.has(key))alerts.push({market:p.market,symbol:p.symbol,code:"DUPLICATE_MARKET_SYMBOL"});
  seen.add(key);
  if (!Number.isFinite(p.quantity)||p.quantity<0||!Number.isFinite(p.market_value_krw)
    ||p.market_value_krw<0||!Number.isFinite(p.unrealized_pnl_krw)){
    alerts.push({market:p.market,symbol:p.symbol,code:"INVALID_NUMERIC_VALUE"});
    continue;
  }
  if(p.quantity>0 && p.market_value_krw===0)
    alerts.push({market:p.market,symbol:p.symbol,code:"POSITIVE_QUANTITY_ZERO_VALUATION"});
  if(p.quantity===0 && p.market_value_krw>0)
    alerts.push({market:p.market,symbol:p.symbol,code:"ZERO_QUANTITY_POSITIVE_VALUATION"});
 }
 return {
  quality_status:alerts.length?"REVIEW_REQUIRED":"NO_STRUCTURAL_ANOMALY_DETECTED",
  valuation_totals_verified: false,
  position_count:positions.length,alert_count:alerts.length,
  alerts,
  note:"Data-quality flags do not establish a security's fair value or prove the broker's total is wrong. A zero valuation can be a missing or suspended price. No substitute value is invented."
 };
}

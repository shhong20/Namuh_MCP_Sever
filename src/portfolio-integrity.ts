/** Explain missing/zero valuations; never silently treat suspicious holdings as valueless. */
export function inspectPositionIntegrity(positions:Array<{
  market:string;symbol:string;name:string;quantity:number;
  market_value_krw:number;unrealized_pnl_krw:number;remaining_quantity?:number|null;unsettled_quantity?:number|null;
}>) {
 const alerts=[];
 const settlement_pending:Array<{market:string;symbol:string;display_quantity:number;status:string}>=[];
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
  if(p.quantity>0 && p.market_value_krw===0) {
    if(p.market==="KR" && Number.isSafeInteger(p.quantity)
       && p.remaining_quantity===0 && Number.isSafeInteger(p.unsettled_quantity)
       && p.unsettled_quantity===-p.quantity)
      settlement_pending.push({market:p.market,symbol:p.symbol,display_quantity:p.quantity,status:"SELL_SETTLEMENT_PENDING_INFERRED"});
    else alerts.push({market:p.market,symbol:p.symbol,code:"POSITIVE_QUANTITY_ZERO_VALUATION"});
  }
  if(p.quantity===0 && p.market_value_krw>0)
    alerts.push({market:p.market,symbol:p.symbol,code:"ZERO_QUANTITY_POSITIVE_VALUATION"});
 }
 return {
  quality_status:alerts.length?"REVIEW_REQUIRED":"NO_STRUCTURAL_ANOMALY_DETECTED",
  valuation_totals_verified: false,
  position_count:positions.length,alert_count:alerts.length,settlement_pending_count:settlement_pending.length,settlement_pending,
  alerts,
  note:"Data-quality flags do not establish a security's fair value or prove the broker's total is wrong. A zero valuation can be a missing or suspended price. No substitute value is invented."
 };
}

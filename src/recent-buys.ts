/** Conservative read-only buy-fill vs broker position valuation comparison. */
export type RecentFill = {
  symbol: string; name: string; date: string; side: string; status: string;
  ordered_quantity: number; filled_quantity: number; cancelled_quantity: number;
  execution_price_usd: number; order_price_usd: number; order_no: number | string;
};
export type UsValuationPosition = {
  symbol: string; name: string; quantity: number; market_value_usd: number;
  market_value_krw: number; valuation_fx_krw_per_usd: number;
};

const n2 = (n: number) => Math.round((n + Number.EPSILON)*100)/100;
export function analyzeRecentUsFills(
  orders: RecentFill[], positions: UsValuationPosition[], sourceDates: string[],
  sourceComplete: boolean
) {
  if (!Array.isArray(orders) || !Array.isArray(positions) || !Array.isArray(sourceDates)
    || sourceDates.length === 0 || !sourceComplete)
    return {ok:false, reason:"INCOMPLETE_SOURCE", rows:[]};
  const bySymbol = new Map<string,UsValuationPosition>();
  for (const p of positions) {
    if (!p || !/^[A-Z0-9.\-]{1,16}$/.test(p.symbol)
      || !Number.isFinite(p.quantity) || p.quantity<0
      || !Number.isFinite(p.market_value_usd) || p.market_value_usd<0) {
      return {ok:false, reason:"INVALID_POSITION_DATA", rows:[]};
    }
    if (bySymbol.has(p.symbol))return {ok:false,reason:"DUPLICATE_POSITION_ROWS",rows:[]};
    bySymbol.set(p.symbol,p);
  }
  // A separate one-fill check can falsely attribute shares when multiple
  // purchases of the same symbol exceed the remaining holding quantity.
  const filledByTicker = new Map<string,number>();
  for (const o of orders) {
    if (o.side==="매수" && o.filled_quantity>0) {
      if (!Number.isFinite(o.filled_quantity) || !Number.isInteger(o.filled_quantity))
        return {ok:false,reason:"INVALID_FILL_QUANTITY",rows:[]};
      filledByTicker.set(o.symbol,(filledByTicker.get(o.symbol)??0)+o.filled_quantity);
    }
  }
  const rows=[];
  for (const f of orders) {
    if (f.side!=="매수" || !(f.filled_quantity>0) || !Number.isFinite(f.execution_price_usd)
      || f.execution_price_usd<=0)continue;
    const p=bySymbol.get(f.symbol);
    const marketPrice=(p && p.quantity>0) ? p.market_value_usd/p.quantity : null;
    const holdingEnough = Boolean(p && p.quantity >= (filledByTicker.get(f.symbol)??0));
    const validity=holdingEnough && marketPrice!==null && Number.isFinite(marketPrice);
    const pnl=validity ? (marketPrice!-f.execution_price_usd)*f.filled_quantity : null;
    rows.push({
      symbol:f.symbol,name:f.name,date:f.date,order_no:f.order_no,
      filled_quantity:f.filled_quantity,execution_price_usd:f.execution_price_usd,
      current_total_holding_quantity:p?.quantity??0,
      current_unit_valuation_usd:validity?n2(marketPrice!):null,
      current_total_valuation_krw:p?.market_value_krw??null,
      indicative_current_unit_valuation_krw:validity&&p&&Number.isFinite(p.market_value_krw)?n2(p.market_value_krw/p.quantity):null,
      indicative_fx_krw_per_usd:p?.valuation_fx_krw_per_usd??null,
      aggregated_recent_filled_quantity:filledByTicker.get(f.symbol)??0,

      indicative_purchase_to_valuation_change_usd:pnl===null?null:n2(pnl),
      indicative_purchase_to_valuation_change_pct:pnl===null?null:n2(100*(marketPrice!/f.execution_price_usd-1)),
      estimate_quality:validity?"INDICATIVE_NOT_LOT_VERIFIED":"NOT_VERIFIABLE",
      warning:"Broker position market price is NOT historical lot-level accounting; intervening trades, cashflows and FX may change results.",
    });
  }
  return {
    ok:true,source_dates:sourceDates,
    source_complete:sourceComplete,
    filled_recent_buys:rows,
    cancelled_excluded_count:orders.filter(o=>o.side==="매수"&&o.status==="cancelled"&&o.filled_quantity===0).length,
    recent_lot_realized_pnl_verified:false,
    recent_lot_unrealized_pnl_verified:false,
    warnings:[
      "These are indicative comparisons of fill prices against current broker holding valuations, not verified per-lot P&L.",
      "If any shares were sold/transferred or corporate actions occurred, lot attribution requires full transaction ledger.",
      "USD comparisons exclude fees, FX conversion, taxes, and dividends.",
      "Current holding full-position unrealized P&L is NOT attributable to recent fills."
    ]
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import {summarizeDailyValuation} from "../dist/daily-valuation.js";

const row=(date,values,qtys=[1,1])=>({
  schema_version:1,date,captured_at:date+"T12:30:00+09:00",
  timezone:"Asia/Seoul",scope:"KR_and_US_securities_only_no_cash",
  holdings_value_krw:values.reduce((a,b)=>a+b,0),holdings_pnl_krw:0,
  domestic_holdings_krw:values[0],us_holdings_krw:values[1],
  positions:[
    {market:"KR",symbol:"005930",name:"Samsung",quantity:qtys[0],market_value_krw:values[0],unrealized_pnl_krw:0},
    {market:"US",symbol:"AAPL",name:"Apple",quantity:qtys[1],market_value_krw:values[1],unrealized_pnl_krw:0}
  ]
});
const nav=(date,value,status="ITEM_TOTAL_MATCHES")=>({
  date,reported_net_assets_krw:value,reconciliation_status:status,verified_full_nav:false
});
test("same holdings allow observed valuation attribution but never actual return",()=>{
  const a=summarizeDailyValuation([row("2026-11-12",[1000,2000]),row("2026-11-13",[1070,1950])],
    [nav("2026-11-12",3500),nav("2026-11-13",3570)]);
  const e=a.series[1];
  assert.equal(e.securities_valuation_change_krw,20);
  assert.equal(e.unchanged_quantity_attributed_change_krw,20);
  assert.equal(e.all_positions_quantity_unchanged,true);
  assert.equal(e.top_unchanged_quantity_contributors[0].value_change_krw,70);
  assert.equal(e.broker_reported_nav_candidate_change_krw,70);
  assert.equal(e.actual_investment_return_pct,null);
  assert.equal(a.full_account_investment_return_available,false);
});
test("changed quantity excludes trade effect from stable holdings attribution",()=>{
  const a=summarizeDailyValuation([row("2026-11-12",[1000,2000]),
    row("2026-11-13",[2100,1960],[2,1])],[]);
  const e=a.series[1];
  assert.equal(e.securities_valuation_change_krw,1060);
  assert.equal(e.unchanged_quantity_attributed_change_krw,-40);
  assert.deepEqual(e.quantity_changed_or_added_or_removed_symbols,["KR:005930"]);
  assert.equal(e.all_positions_quantity_unchanged,false);
  assert.equal(e.top_unchanged_quantity_contributors.length,1);
});
test("gap is not mislabeled daily move and missing NAV is not imputed",()=>{
  const a=summarizeDailyValuation([row("2026-11-12",[1000,2000]),
    row("2026-11-16",[1200,2300])],[]);
  const e=a.series[1];
  assert.equal(e.calendar_gap_days,4);
  assert.equal(e.broker_reported_nav_candidate_change_krw,null);
  assert.ok(e.return_blockers.includes("OBSERVATION_NOT_NEXT_CALENDAR_DAY"));
});
test("duplicate date rejects history; inconsistent position total fails closed",()=>{
  const day=row("2026-11-12",[1000,2000]);
  assert.throws(()=>summarizeDailyValuation([day,day],[]),/DUPLICATE/);
  const bad={...row("2026-11-13",[1100,2000]),holdings_value_krw:999999};
  const a=summarizeDailyValuation([day,bad],[]);
  assert.equal(a.series[1].securities_valuation_change_krw,null);
  assert.deepEqual(a.series[1].top_unchanged_quantity_contributors,[]);
  assert.ok(a.series[1].return_blockers.includes("SNAPSHOT_POSITION_TOTAL_MISMATCH"));
});

test("weekend recordings are marked non-session observations, not market return",()=>{
 const a=summarizeDailyValuation([row("2026-11-20",[1000,2000]),row("2026-11-21",[1020,2000])],[]);
 assert.equal(a.series[1].observation_on_weekend,true);
 assert.equal(a.series[1].exchange_session_calendar_verified,false);
 assert.ok(a.series[1].return_blockers.includes("WEEKEND_OBSERVATION_NOT_MARKET_RETURN"));
 assert.equal(a.series[1].actual_investment_return_pct,null);
});

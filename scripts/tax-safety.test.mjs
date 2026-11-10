import test from "node:test";
import assert from "node:assert/strict";
import {classifyTaxReadiness,classifyDailyCandle} from "../dist/tax-safety.js";
const positions=[
 {market:"US",symbol:"AAPL",name:"Apple",quantity:1,market_value_krw:500000,unrealized_pnl_krw:240000},
 {market:"US",symbol:"DXYZ",name:"Destiny",quantity:13,market_value_krw:400000,unrealized_pnl_krw:-300000},
 {market:"KR",symbol:"005930",name:"Samsung",quantity:3,market_value_krw:200000,unrealized_pnl_krw:1000}
];
test("unrealized gains never become certified tax allowance",()=>{
 const result=classifyTaxReadiness(positions,{rsp_cd:"13578",Output_0:{fc_rzt_pls_sum:0}},2026);
 assert.equal(result.ok,true);
 assert.equal(result.potential_unrealized_gains_krw,240000);
 assert.equal(result.potential_unrealized_losses_krw,-300000);
 assert.equal(result.gain_candidates.length,1);
 assert.equal(result.tax_free_allowance_remaining_krw,null);
 assert.equal(result.realized_taxable_gain_krw,null);
 assert.equal(result.broker_yearly_page_complete_verified,false);
 assert.equal(result.orders_submitted,false);
});
test("broker failure cannot be treated as zero realized gain",()=>{
 const r=classifyTaxReadiness(positions,{rsp_cd:"00218"},2026);
 assert.equal(r.broker_yearly_query_ok,false);
 assert.equal(r.broker_reported_yearly_realized_raw_first_response,null);
 assert.equal(r.tax_free_allowance_remaining_krw,null);
});
test("duplicate symbols fail closed",()=>{
 assert.equal(classifyTaxReadiness([...positions,positions[0]],{},2026).ok,false);
});
test("bullish, bearish, doji distinguished from profit",()=>{
 const date="20261109";
 assert.equal(classifyDailyCandle("AAPL",[{trade_date:date,open_prc:100,close_prc:101}],date).status,"BULLISH");
 assert.equal(classifyDailyCandle("AAPL",[{trade_date:date,open_prc:101,close_prc:100}],date).status,"BEARISH");
 assert.equal(classifyDailyCandle("AAPL",[{trade_date:date,open_prc:100,close_prc:100}],date).status,"DOJI");
});
test("no candle for requested date does not backfill previous day",()=>{
 assert.equal(classifyDailyCandle("AAPL",[{trade_date:"20261106",open_prc:100,close_prc:102}],"20261109").status,"DATE_NOT_AVAILABLE");
 assert.equal(classifyDailyCandle("AAPL",[{trade_date:"20261109",open_prc:0,close_prc:10}],"20261109").status,"INVALID_CANDLE");
});

import test from "node:test";
import assert from "node:assert/strict";
import {inspectPositionIntegrity} from "../dist/portfolio-integrity.js";
import {summarizeBalances} from "../dist/portfolio.js";
test("positive holdings with zero market value emit review-required alert",()=>{
 const d=summarizeBalances(
  {Output_0:{},Output_1:[{iem_cd:"0193T0",iem_nm:"Leveraged",itg_bnc_qty:38,eal_amt:0,eal_pls_amt:0}]},
  {Output_0:{},Output_1:[]});
 assert.equal(d.data_quality.quality_status,"REVIEW_REQUIRED");
 assert.equal(d.data_quality.alerts[0].code,"POSITIVE_QUANTITY_ZERO_VALUATION");
 assert.equal(d.data_quality.valuation_totals_verified,false);
 assert.equal(d.positions[0].market_value_krw,0);
});
test("negative numbers, duplicate symbols and nonzero value zero shares are flagged",()=>{
 const rows=[
  {market:"KR",symbol:"AAA",name:"One",quantity:2,market_value_krw:100,unrealized_pnl_krw:1},
  {market:"KR",symbol:"AAA",name:"Two",quantity:0,market_value_krw:100,unrealized_pnl_krw:1},
  {market:"US",symbol:"BBB",name:"Three",quantity:-1,market_value_krw:500,unrealized_pnl_krw:0}];
 const d=inspectPositionIntegrity(rows);
 assert.equal(d.alert_count,3);
 assert.ok(d.alerts.some(x=>x.code==="DUPLICATE_MARKET_SYMBOL"));
 assert.ok(d.alerts.some(x=>x.code==="INVALID_NUMERIC_VALUE"));
});
test("normal holdings do not claim valuations are independently verified",()=>{
 const r=inspectPositionIntegrity([{market:"US",symbol:"AAPL",name:"Apple",quantity:1,market_value_krw:400000,unrealized_pnl_krw:100}]);
 assert.equal(r.quality_status,"NO_STRUCTURAL_ANOMALY_DETECTED");
 assert.equal(r.valuation_totals_verified,false);
});

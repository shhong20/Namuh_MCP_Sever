import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRecentUsFills} from '../dist/recent-buys.js';
const orders=[
  {symbol:'SPCX',name:'SpaceX',date:'20261105',order_no:1,side:'매수',status:'filled',filled_quantity:1,execution_price_usd:126.65,order_price_usd:126.65,cancelled_quantity:0,ordered_quantity:1},
  {symbol:'PLTR',name:'Palantir',date:'20261105',order_no:2,side:'매수',status:'cancelled',filled_quantity:0,execution_price_usd:0,order_price_usd:154.8,cancelled_quantity:1,ordered_quantity:1},
  {symbol:'UNH',name:'UnitedHealth',date:'20261106',order_no:3,side:'매수',status:'filled',filled_quantity:1,execution_price_usd:392,order_price_usd:392,cancelled_quantity:0,ordered_quantity:1},
];
const positions=[
  {symbol:'SPCX',name:'SpaceX',quantity:4,market_value_usd:542.8,market_value_krw:737068,valuation_fx_krw_per_usd:1357.9},
  {symbol:'UNH',name:'UnitedHealth',quantity:1,market_value_usd:397.8,market_value_krw:540172,valuation_fx_krw_per_usd:1357.9},
];
test('only actual fills, no canceled orders; do not conflate existing four shares',()=>{
  const r=analyzeRecentUsFills(orders,positions,['20261105','20261106'],true);
  assert.equal(r.ok,true);
  assert.equal(r.filled_recent_buys.length,2);
  assert.equal(r.cancelled_excluded_count,1);
  assert.equal(r.filled_recent_buys[0].current_total_holding_quantity,4);
  assert.equal(r.filled_recent_buys[0].current_unit_valuation_usd,135.7);
  assert.equal(r.filled_recent_buys[0].indicative_purchase_to_valuation_change_usd,9.05);
  assert.equal(r.filled_recent_buys[1].indicative_purchase_to_valuation_change_usd,5.8);
  assert.equal(r.recent_lot_unrealized_pnl_verified,false);
  assert.equal(JSON.stringify(r).includes('account_no'),false);
});
test('incomplete sources fail closed',()=>{
  assert.equal(analyzeRecentUsFills(orders,positions,['20261105'],false).ok,false);
  assert.equal(analyzeRecentUsFills(orders,positions,[],true).ok,false);
});
test('sold or transferred holdings are not asserted as per-lot gains',()=>{
  const missing=analyzeRecentUsFills(orders,[{...positions[0],quantity:0,market_value_usd:0}],['20261105'],true);
  assert.equal(missing.filled_recent_buys[0].estimate_quality,'NOT_VERIFIABLE');
  assert.equal(missing.filled_recent_buys[0].indicative_purchase_to_valuation_change_usd,null);
});
test('duplicate positions are rejected',()=>{
  assert.equal(analyzeRecentUsFills(orders,[...positions,positions[0]],['20261105'],true).ok,false);
});

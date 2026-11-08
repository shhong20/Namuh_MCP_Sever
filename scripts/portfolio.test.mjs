import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBalances, normalizeOrders, normalizeDomesticOrders, savingsPlan, numberOf } from "../dist/portfolio.js";

test("missing numbers are neutral", () => {
  assert.equal(numberOf(undefined), 0);
  assert.equal(numberOf("123.4"), 123.4);
  assert.equal(numberOf("NaN"), 0);
});
test("KR+US position values only, not account totals or cash", () => {
  const dom = {
    Output_0:{tot_eal_amt:2000,tot_eal_pls:-600},
    Output_1:[
      {iem_cd:"005930",iem_nm:"삼성전자",itg_bnc_qty:2,eal_amt:1000,eal_pls_amt:-300,pft_rt:-23.08},
      {iem_cd:"0193T0",iem_nm:"KODEX SK하이닉스단일종목레버리지",itg_bnc_qty:3,eal_amt:100,eal_pls_amt:-900,pft_rt:-90}
    ]
  };
  const usa={
    Output_0:{eal_amt_sum:8000,eal_pls_sum_amt:180},
    Output_1:[{
      iem_cd:"US0000000000",iem_nm:"TSMC",cns_bse_bnc_qty:1,
      krw_eal_amt:1500,krw_eal_pls_amt:300,eal_pft_rt1:25,
      fc_abk_amt:1,fc_eal_amt:1.5,krw_abk_amt1:1200,tdt_sby_bse_xcg_rt:1000,
    }]
  };
  const s=summarizeBalances(dom,usa);
  assert.equal(s.market_value_krw,2600);
  assert.equal(s.position_unrealized_pnl_krw,-900);
  assert.equal(s.account_reported_unrealized_pnl_krw,-420);
  assert.equal(s.positions[2].quantity,1);
  assert.equal(s.risk.explicit_leveraged_positions.length,1);
  assert.equal(s.fx_attribution.totals.stock_effect_krw,500);
  assert.equal(s.fx_attribution.totals.fx_effect_krw,-200);
  assert.equal(s.fx_attribution.totals.residual_krw,0);
  assert.equal(s.positions.some(p=>p.account_no),false);
});
test("order states fully filled, unfilled, cancelled and partial fill",()=>{
  const data={Output_0:[
    {orr_no:1,orr_qty:1,cns_qty:1,can_qty:0,ny_cns_orr_qty:0},
    {orr_no:2,orr_qty:1,cns_qty:0,can_qty:0,ny_cns_orr_qty:1},
    {orr_no:3,orr_qty:1,cns_qty:0,can_qty:1,ny_cns_orr_qty:0},
    {orr_no:4,orr_qty:3,cns_qty:1,can_qty:0,ny_cns_orr_qty:2},
  ]};
  assert.deepEqual(normalizeOrders(data).map(x=>x.status),["filled","unfilled","cancelled","partial_fill"]);
});
test("domestic orders and empty broker results",()=>{
  const d={Output_0:[
    {iem_cd:"005930",orr_qty:5,tot_cns_qty:3,can_qty:0,ny_cns_qty:2,orr_pr:1000},
    {iem_cd:"000660",orr_qty:2,tot_cns_qty:2,can_qty:0,ny_cns_qty:0,orr_pr:1000},
  ]};
  assert.deepEqual(normalizeDomesticOrders(d).map(r=>r.status),["partial_fill","filled"]);
  assert.deepEqual(normalizeDomesticOrders({Output_0:[]}),[]);
  const s=summarizeBalances({Output_1:[],Output_0:{}},{Output_1:[],Output_0:{}});
  assert.equal(s.market_value_krw,0);
  assert.equal(s.risk.largest_position,null);
});

test("emergency fund before new investments",()=>{
  assert.deepEqual([savingsPlan(300000,0,1000000).months_to_initial_goal,
    savingsPlan(300000,0,1000000).monthly_investment_allocation_krw],[10,0]);
  assert.equal(savingsPlan(300000,3000000,1000000).monthly_investment_allocation_krw,300000);
});

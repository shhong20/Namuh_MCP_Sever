import test from "node:test";
import assert from "node:assert/strict";
import {makeNavCandidate} from "../dist/nav-candidate.js";
import {summarizeAccountingTrend} from "../dist/nav-accounting-trend.js";
function collected({cash=938254,margin=704967,orderable=233287,assets=7904053,delta=704899}={}){
 const rows=[{iem_mlf_nm:"주식",eal_amt:assets+delta-cash},{iem_mlf_nm:"외화예수금",eal_amt:cash}];
 return {data:{Output_0:{nas_amt:assets,tot_aet_amt:assets,krw_tsl_fc_dca:cash,krw_tsl_fc_mgg_amt:margin,krw_tsl_fc_orr_pbl_amt:orderable},Output_1:rows},
 audit:{complete:true,duplicate_rows:0,page_count:2,codes:["00218","00166"],rows_collected:rows.length}};
}
test("new candidates capture accounting comparisons from same page set without extra request",()=>{
 const a=makeNavCandidate(collected(),"2026-11-10");
 assert.equal(a.accounting_evidence.item_delta_less_foreign_margin_krw,-68);
 assert.equal(a.accounting_evidence.foreign_cash_less_margin_and_orderable_krw,0);
 assert.equal(a.accounting_evidence.asset_groups_krw["외화예수금"].value_krw,938254);
 assert.equal(a.verified_full_nav,false);
 assert.equal(a.usable_for_investment_return,false);
});
test("legacy immutable candidate is retained and shown with missing audit detail",()=>{
 const prior=makeNavCandidate(collected(),"2026-11-09");
 delete prior.accounting_evidence;
 const next=makeNavCandidate(collected(),"2026-11-10");
 const report=summarizeAccountingTrend([next,prior]);
 assert.equal(report.recorded_days,2);
 assert.equal(report.composition_evidenced_days,1);
 assert.equal(report.date_series[0].delta_minus_margin_krw,null);
 assert.equal(report.date_series[1].delta_minus_margin_krw,-68);
 assert.equal(report.stable_residual_over_multiple_days,null);
 assert.equal(report.confirmed_accounting_formula,false);
 assert.equal(report.investor_return_available,false);
});
test("two days of a stable numerical residual do not prove accounting",()=>{
 const r=summarizeAccountingTrend([
  makeNavCandidate(collected(),"2026-11-10"),
  makeNavCandidate(collected(),"2026-11-11")
 ]);
 assert.equal(r.stable_residual_over_multiple_days,true);
 assert.equal(r.confirmed_accounting_formula,false);
 assert.equal(r.investor_return_available,false);
});

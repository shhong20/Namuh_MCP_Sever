import test from "node:test";
import assert from "node:assert/strict";
import {reconcileAccountViews,classifyExternalTransactions} from "../dist/reconciliation.js";

test("integrated account report containing US equity is not double-counted",()=>{
 const integrated={rsp_cd:"00218",rsp_msg:"계속 조회시 다음(연속조회) 버튼",Output_0:{
  tot_aet_amt:0,nas_amt:0,krw_tsl_fc_dca:927268,krw_tsl_fc_mgg_amt:696712,
 },Output_1:[
  {iem_mlf_nm:"주식",eal_amt:1000},
  {iem_mlf_nm:"외화주식",eal_amt:2000},
 ]};
 const domestic={rsp_cd:"00166",Output_0:{dca:100,tot_aet_amt:2000,nas_amt:1000},Output_1:[{eal_amt:1000}]};
 const foreign={rsp_cd:"00166",Output_0:{krw_dca:927268,tot_aet_amt:3000,krw_ny_stl_xcl_amt:-700},Output_1:[{krw_eal_amt:2000}]};
 const a=reconcileAccountViews(integrated,domestic,foreign);
 assert.equal(a.sources[0].pagination_required,true);
 assert.equal(a.audit_status,"INCOMPLETE_SOURCE_PAGINATION_OR_ERROR");
 assert.equal(a.observed.integrated_page_includes_us_securities,true);
 assert.equal(a.observed.combined_securities_only_krw,3000);
 assert.equal(a.verified_full_net_asset_krw,null);
 assert.equal(a.eligible_for_realized_portfolio_return,false);
 assert.equal(a.broker_reported_fields_not_additive.overseas_cash_estimate_krw,927268);
 assert.equal(JSON.stringify(a).includes("act_no"),false);
 assert.ok(a.warnings.some(x=>x.includes("중복")));
});
test("complete source responses are still not a reconciled net-asset valuation",()=>{
 const a=reconcileAccountViews({rsp_cd:"00166",Output_0:{nas_amt:123},Output_1:[]},
  {rsp_cd:"00166",Output_0:{nas_amt:123},Output_1:[]},
  {rsp_cd:"13578",Output_0:{},Output_1:[]});
 assert.equal(a.audit_status,"UNRECONCILED_ACCOUNTING");
 assert.equal(a.verified_full_net_asset_krw,null);
});
test("external flows cannot be falsely inferred from security buy sell and dividend",()=>{
 const a=classifyExternalTransactions([
  {trd_dt:"20261101",sps_cd_nm:"외화배당금입금",fc_trd_amt:3,cur_cd_nm:"USD"},
  {trd_dt:"20261102",sps_cd_nm:"외화증권매수",fc_trd_amt:10},
  {trd_dt:"20261103",sps_cd_nm:"외화증권매도",fc_trd_amt:10},
  {trd_dt:"20261104",sps_cd_nm:"미분류입금",fc_trd_amt:999},
 ]);
 assert.equal(a.counts.internal_dividend,1);
 assert.equal(a.counts.internal_buy,1);
 assert.equal(a.counts.internal_sell,1);
 assert.equal(a.counts.unverified,1);
 assert.equal(a.complete_external_flow_ledger,false);
 assert.equal(a.verified_net_external_flow_krw,null);
});

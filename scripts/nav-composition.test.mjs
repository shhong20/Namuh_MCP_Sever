import test from "node:test";
import assert from "node:assert/strict";
import {diagnoseNavComposition} from "../dist/nav-composition.js";

test("foreign-margin proximity is diagnosed but never promoted to verified NAV",()=>{
 const summary={nas_amt:7904053,tot_aet_amt:7904053,krw_tsl_fc_dca:938254,
  krw_tsl_fc_mgg_amt:704967,krw_tsl_fc_orr_pbl_amt:233287};
 const rows=[
  {iem_mlf_nm:"주식",eal_amt:2251800},
  {iem_mlf_nm:"ETF",eal_amt:148200},
  {iem_mlf_nm:"자유약정형 RP",eal_amt:15},
  {iem_mlf_nm:"외화주식",eal_amt:4840487},
  {iem_mlf_nm:"외화ETP",eal_amt:430196},
  {iem_mlf_nm:"외화예수금",eal_amt:938254}
 ];
 const r=diagnoseNavComposition(summary,rows,true);
 assert.equal(r.comparisons.sum_of_listed_items_krw,8608952);
 assert.equal(r.comparisons.listed_items_minus_broker_assets_krw,704899);
 assert.equal(r.comparisons.listed_delta_minus_margin_krw,-68);
 assert.equal(r.comparisons.foreign_cash_minus_margin_and_orderable_krw,0);
 assert.equal(r.comparisons.foreign_cash_group_minus_broker_cash_krw,0);
 assert.equal(r.diagnostic_status,"DIFFERENCE_REQUIRES_ACCOUNTING_POLICY");
 assert.equal(r.verified_full_net_asset_krw,null);
 assert.equal(r.return_calculation_allowed,false);
});
test("incomplete pages, bad or missing values never produce partial total",()=>{
 const r=diagnoseNavComposition({nas_amt:1000,tot_aet_amt:1000},[{iem_mlf_nm:"주식",eal_amt:500},{iem_mlf_nm:"외화예수금",eal_amt:null}],false);
 assert.equal(r.diagnostic_status,"INCOMPLETE_EVIDENCE");
 assert.equal(r.comparisons.sum_of_listed_items_krw,null);
 assert.equal(r.unparseable_rows,1);
 assert.equal(r.verified_full_net_asset_krw,null);
});
test("even matching line items do not certify investment return",()=>{
 const r=diagnoseNavComposition({nas_amt:1000,tot_aet_amt:1000},[{iem_mlf_nm:"주식",eal_amt:1000}],true);
 assert.equal(r.diagnostic_status,"LISTED_ITEMS_MATCH_BROKER_ASSETS");
 assert.equal(r.verified_full_net_asset_krw,null);
 assert.equal(r.return_calculation_allowed,false);
});

import test from "node:test";
import assert from "node:assert/strict";
import {auditNavObservations} from "../dist/nav-anomaly.js";

function nav(date,value,detail=true) {
 return {
  schema_version:1,date,captured_at:date+"T11:40:00Z",timezone:"Asia/Seoul",
  reported_net_assets_krw:value,reported_total_assets_krw:value,
  listed_asset_items_sum_krw:value+704899,reconciliation_delta_krw:704899,
  asset_item_count:15,page_count:2,pagination_codes:["00218","00166"],
  pagination_complete:true,reconciliation_status:"DIFFERENCE_REQUIRES_REVIEW",
  verified_full_nav:false,usable_for_investment_return:false,
  ...(detail?{accounting_evidence:{
    foreign_cash_krw:938254,foreign_margin_krw:704967,
    foreign_orderable_krw:233287,foreign_cash_less_margin_and_orderable_krw:0,
    item_delta_less_foreign_margin_krw:-68,asset_groups_krw:{},
    classification:"DIFFERENCE_REQUIRES_ACCOUNTING_POLICY"}}:{})
 };
}
test("one old snapshot surfaces missing composition and no synthetic investment return",()=>{
 const r=auditNavObservations([nav("2026-11-09",7904053,false)],["2026-11-09"]);
 assert.equal(r.observation_count,1);
 assert.equal(r.flagged_counts.NO_SAME_DAY_COMPOSITION_EVIDENCE,1);
 assert.equal(r.series[0].candidate_value_change_pct,null);
 assert.equal(r.investment_return_pct,null);
 assert.equal(r.investment_return_available,false);
});
test("successive days are diagnostic only; large delta flagged, residual remains",()=>{
 const a=auditNavObservations([nav("2026-11-09",1000000),nav("2026-11-10",1100000)],["2026-11-09","2026-11-10"]);
 assert.equal(a.series[1].candidate_value_change_pct,10);
 assert.ok(a.series[1].flags.includes("LARGE_DAY_OVER_DAY_CANDIDATE_CHANGE"));
 assert.equal(a.flagged_counts.MARGIN_EXPLANATION_HAS_RESIDUAL,2);
 assert.equal(a.broker_nav_confirmed,false);
});
test("missing day and missing holdings remain explicit; no daily spike claim across gap",()=>{
 const a=auditNavObservations([nav("2026-11-09",1000000),nav("2026-11-12",1500000)],["2026-11-09"]);
 assert.equal(a.flagged_counts.CALENDAR_GAP_BETWEEN_OBSERVATIONS,1);
 assert.equal(a.flagged_counts.NO_HOLDINGS_SNAPSHOT_ON_DATE,1);
 assert.ok(!a.series[1].flags.includes("LARGE_DAY_OVER_DAY_CANDIDATE_CHANGE"));
 assert.equal(a.series[1].is_consecutive_calendar_day,false);
});
test("empty history stays neutral",()=>{
 const a=auditNavObservations([],[]);
 assert.equal(a.observation_count,0);
 assert.equal(a.dates_with_flags,0);
 assert.equal(a.investment_return_pct,null);
});

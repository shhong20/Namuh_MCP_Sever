import test from "node:test";
import assert from "node:assert/strict";
import {inspectCaptureState} from "../dist/capture-integrity.js";
const entry=(date)=>({date,captured_at:date+"T11:40:00Z"});
test("before either timer, missing today is pending not failed",()=>{
 const a=inspectCaptureState([entry("2026-11-08")],[entry("2026-11-09")],new Date("2026-11-09T00:00:00Z"));
 assert.equal(a.datasets.holdings.status,"PENDING_SCHEDULE");
 assert.equal(a.datasets.nav_candidates.status,"TODAY_CAPTURED");
 assert.equal(a.same_date_comparison_available,false);
 assert.deepEqual(a.mismatched_record_dates.holdings_only,["2026-11-08"]);
 assert.deepEqual(a.mismatched_record_dates.nav_only,["2026-11-09"]);
 assert.equal(a.investment_return_available,false);
});
test("between 20:30 and 20:40 only due missing holdings, nav pending",()=>{
 const a=inspectCaptureState([],[],new Date("2026-11-09T11:35:00Z"));
 assert.equal(a.datasets.holdings.status,"NO_RECORDS");
 assert.equal(a.datasets.nav_candidates.status,"PENDING_SCHEDULE");
});
test("after schedule with last day record is missing; no backfill prescribed",()=>{
 const a=inspectCaptureState([entry("2026-11-08")],[entry("2026-11-08")],new Date("2026-11-09T13:00:00Z"));
 assert.equal(a.datasets.holdings.status,"DUE_BUT_MISSING");
 assert.equal(a.datasets.nav_candidates.status,"DUE_BUT_MISSING");
 assert.equal(a.same_date_comparison_available,true);
 assert.ok(a.repair_policy.historic_gaps.includes("소급"));
});
test("two same-date records remain unverified NAV and non-return",()=>{
 const a=inspectCaptureState([entry("2026-11-09")],[entry("2026-11-09")],new Date("2026-11-09T13:00:00Z"));
 assert.deepEqual(a.same_day_pairs,["2026-11-09"]);
 assert.equal(a.datasets.holdings.status,"TODAY_CAPTURED");
 assert.equal(a.datasets.nav_candidates.status,"TODAY_CAPTURED");
 assert.equal(a.verified_account_nav,false);
 assert.equal(a.paired_observations[0].direct_return_comparison_allowed,false);
});
test("same-date holdings and NAV expose timestamp separation without interpreting portfolio returns",()=>{
 const h={date:"2026-11-09",captured_at:"2026-11-09T11:30:00.000Z",holdings_value_krw:7000000};
 const n={date:"2026-11-09",captured_at:"2026-11-09T11:40:00.000Z",reported_net_assets_krw:7900000};
 const a=inspectCaptureState([h],[n],new Date("2026-11-09T12:00:00Z"));
 assert.equal(a.paired_observations[0].capture_gap_minutes,10);
 assert.equal(a.paired_observations[0].holdings_only_value_krw,7000000);
 assert.equal(a.paired_observations[0].broker_nav_candidate_krw,7900000);
 assert.equal(a.paired_observations[0].direct_return_comparison_allowed,false);
 assert.equal(a.investment_return_available,false);
});
test("gap detection lists observation intervals without inventing snapshots",()=>{
 const a=inspectCaptureState([entry("2026-11-07"),entry("2026-11-09")],[],new Date("2026-11-09T11:00:00Z"));
 assert.deepEqual(a.datasets.holdings.recent_calendar_gaps,["2026-11-07 → 2026-11-09"]);
 assert.deepEqual(a.datasets.holdings.observed_dates,["2026-11-07","2026-11-09"]);
});

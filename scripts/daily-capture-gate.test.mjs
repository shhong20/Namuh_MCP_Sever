import test from "node:test";
import assert from "node:assert/strict";
import {evaluateDailyCaptureGate} from "../dist/daily-capture-gate.js";
const h=(date,at="2026-11-09T11:30:00Z")=>({date,captured_at:at,holdings_value_krw:7500000});
const n=(date,at="2026-11-09T11:40:00Z")=>({date,captured_at:at,reported_net_assets_krw:8000000,
 verified_full_nav:false,reconciliation_status:"DIFFERENCE_REQUIRES_REVIEW"});
test("before 20:50 no missing-data failure, no API repair",()=>{
 const r=evaluateDailyCaptureGate([h("2026-11-08")],[n("2026-11-09")],new Date("2026-11-09T10:00:00Z"));
 assert.equal(r.decision,"PENDING_VALIDATION_WINDOW");
 assert.equal(r.due,false);
});
test("both after 20:50: candidate accounting mismatch is not source capture failure",()=>{
 const r=evaluateDailyCaptureGate([h("2026-11-09")],[n("2026-11-09")],new Date("2026-11-09T11:55:00Z"));
 assert.equal(r.decision,"CAPTURED_ACCOUNTING_REVIEW_REQUIRED");
 assert.equal(r.pair_verified,true);
 assert.equal(r.capture_gap_minutes,10);
 assert.equal(r.portfolio_return_enabled,false);
});
test("missing holdings is flagged after validation time, no historic backfill",()=>{
 const r=evaluateDailyCaptureGate([h("2026-11-08")],[n("2026-11-09")],new Date("2026-11-09T11:55:00Z"));
 assert.equal(r.decision,"CAPTURE_INTEGRITY_REVIEW_REQUIRED");
 assert.ok(r.findings.includes("HOLDINGS_MISSING_FOR_TODAY"));
 assert.equal(r.pair_verified,false);
});
test("morning NAV compared with evening holdings is flagged for separated timestamps",()=>{
 const r=evaluateDailyCaptureGate(
  [h("2026-11-09","2026-11-09T11:30:00Z")],
  [n("2026-11-09","2026-11-09T00:00:00Z")],
  new Date("2026-11-09T11:55:00Z"));
 assert.ok(r.findings.includes("CAPTURE_TIMESTAMPS_MORE_THAN_30_MINUTES_APART"));
 assert.equal(r.pair_verified,false);
});
test("clean on same timestamp range remains only a capture check, never verified portfolio NAV",()=>{
 const clean={...n("2026-11-09"),reconciliation_status:"ITEM_TOTAL_MATCHES"};
 const r=evaluateDailyCaptureGate([h("2026-11-09")],[clean],new Date("2026-11-09T11:55:00Z"));
 assert.equal(r.decision,"CAPTURED_SOURCE_CHECK_PASS");
 assert.equal(r.portfolio_return_enabled,false);
 assert.equal(r.source_integrity_only,true);
});

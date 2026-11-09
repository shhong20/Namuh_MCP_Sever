import test from "node:test";
import assert from "node:assert/strict";
import {summarizeCaptureOperations,parseJournalText,SERVICE_UNITS} from "../dist/capture-ops.js";
const msg=(svc,body,i)=>({_SYSTEMD_USER_UNIT:SERVICE_UNITS[svc],SYSLOG_IDENTIFIER:"node",
 MESSAGE:JSON.stringify(body),__REALTIME_TIMESTAMP:String(1794182800000000+i*1000000)});
test("journal metrics are grounded in observed entries; older durations remain unknown",()=>{
 const entries=[
  msg("holdings",{decision:"SNAPSHOT_OK",date:"2026-11-08",created:false},0),
  msg("holdings",{decision:"SNAPSHOT_OK",date:"2026-11-09",created:true,duration_ms:500,broker_calls:3},1),
  msg("holdings",{decision:"SNAPSHOT_FAILED",failure_kind:"BROKER_RATE_LIMIT",duration_ms:200},2),
  msg("nav",{decision:"NAV_CANDIDATE_OK",date:"2026-11-09",created:true,duration_ms:1500,source_pages:2,broker_calls:3},3),
  msg("validation",{decision:"PENDING_VALIDATION_WINDOW",duration_ms:12},4),
  msg("validation",{decision:"CAPTURE_INTEGRITY_REVIEW_REQUIRED",duration_ms:22},5),
 ];
 const out=summarizeCaptureOperations(entries,30);
 const h=out.services.holdings;
 assert.equal(h.observed_invocations,3);
 assert.equal(h.observed_successes,2);
 assert.equal(h.observed_failures,1);
 assert.equal(h.observed_success_pct,66.67);
 assert.equal(h.measured_durations,2);
 assert.equal(h.latency_ms.p95,500);
 assert.equal(h.errors.BROKER_RATE_LIMIT,1);
 assert.equal(out.services.nav.observed_source_pages.total,2);
 assert.equal(out.services.nav.observed_broker_calls.total,3);
 assert.equal(out.services.validation.observed_failures,1);
 assert.equal(out.full_schedule_coverage_verified,false);
 assert.equal(out.performance_returns_available,false);
});
test("malformed journal, wrong services, raw secrets and unknown codes are ignored or redacted",()=>{
 const entries=[
  msg("holdings",{decision:"SNAPSHOT_OK",duration_ms:-100,broker_calls:-2,account_number:"SECRET"},0),
  {...msg("holdings",{decision:"SNAPSHOT_FAILED",failure_kind:"SECRET"},1),_SYSTEMD_USER_UNIT:"other.service"},
  msg("holdings",{decision:"SECRET_FAILURE",secret:"value"},2),
  {...msg("holdings",{decision:"SNAPSHOT_OK"},3),SYSLOG_IDENTIFIER:"syslog"},
  msg("nav",{decision:"NAV_CANDIDATE_FAILED",failure_kind:"UNRECOGNIZED_SECRET"},4),
 ];
 const r=summarizeCaptureOperations(entries);
 assert.equal(r.records_observed,2);
 assert.equal(r.services.holdings.measured_durations,0);
 assert.equal(r.services.holdings.observed_broker_calls.samples,0);
 assert.equal(r.services.nav.errors.NAV_CANDIDATE_FAILED,1);
 assert.equal(JSON.stringify(r).includes("SECRET"),false);
});
test("journal NDJSON parsing skips malformed lines",()=>{
 const a=msg("validation",{decision:"CAPTURED_SOURCE_CHECK_PASS",duration_ms:27},0);
 const entries=parseJournalText("garbage\n{invalid}\n"+JSON.stringify(a)+"\n");
 assert.equal(entries.length,1);
 assert.equal(summarizeCaptureOperations(entries).services.validation.observed_successes,1);
});

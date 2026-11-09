import test from "node:test";
import assert from "node:assert/strict";
import {evaluateScheduleCoverage,parseBootWindows} from "../dist/capture-schedule-coverage.js";

const ts=(day,hhmm)=>day+"T"+hhmm+":00+09:00";
const e=(service,decision,day,hhmm)=>({
 service,decision,date:day,timestamp:new Date(ts(day,hhmm)).toISOString(),
 duration_ms:null,source_pages:null,broker_calls:null,failure_kind:null,created:null
});
const window=(start,end)=>({boot_id:"synthetic",start_ms:Date.parse(ts(...start)),end_ms:Date.parse(ts(...end))});
test("only post-baseline due slots counted; runtime evidence is not a confirmed failure",()=>{
 const events=[e("holdings","SNAPSHOT_OK","2026-11-08","21:20")];
 const b=[window(["2026-11-09","19:00"],["2026-11-09","21:00"])];
 const report=evaluateScheduleCoverage(events,b,new Date(ts("2026-11-10","22:00")),4);
 const h=report.services.holdings;
 assert.equal(h.due_slots_since_first_observed_event,3);
 assert.equal(h.days_with_observed_result,1);
 assert.equal(h.observed_success_days,1);
 assert.equal(h.no_result_with_runtime_evidence,1);
 assert.equal(h.no_result_runtime_unconfirmed,1);
 assert.equal(h.observed_result_coverage_pct,33.33);
 assert.equal(h.scheduled_activation_proven,false);
 assert.equal(report.full_schedule_success_rate,null);
 assert.equal(report.wsl_downtime_confirmed,false);
 assert.equal(report.services.nav.due_slots_since_first_observed_event,0);
});
test("before today's due slot does not count it; manual pre-schedule event is not scheduled result",()=>{
 const events=[
  e("nav","NAV_CANDIDATE_OK","2026-11-09","09:00"),
  e("nav","NAV_CANDIDATE_OK","2026-11-10","10:00")
 ];
 const out=evaluateScheduleCoverage(events,[],new Date(ts("2026-11-10","20:20")),2);
 const n=out.services.nav;
 assert.equal(n.due_slots_since_first_observed_event,1);
 assert.equal(n.days_with_observed_result,0);
 assert.equal(n.no_result_runtime_unconfirmed,1);
 assert.equal(n.slots[0].date,"2026-11-09");
});
test("failure followed by same date success is retained as failure, no automatic retry semantics",()=>{
 const e1=e("validation","CAPTURE_VALIDATION_FAILED","2026-11-09","20:57");
 const e2=e("validation","CAPTURED_SOURCE_CHECK_PASS","2026-11-09","21:01");
 const out=evaluateScheduleCoverage([e1,e2],[],new Date(ts("2026-11-09","23:00")),1);
 const v=out.services.validation;
 assert.equal(v.observed_failure_days,1);
 assert.equal(v.observed_success_days,0);
 assert.equal(v.slots[0].observed_outcomes,2);
 assert.equal(v.slots[0].scheduled_timer_invocation_proven,false);
});
test("parse journald boot JSON microseconds and reject corrupt intervals",()=>{
 const raw=[{boot_id:"test",first_entry:1794182400000000,last_entry:1794186000000000},
 {boot_id:"bad",first_entry:"abc",last_entry:1},
 {boot_id:"reverse",first_entry:30,last_entry:10}];
 const arr=parseBootWindows(raw);
 assert.equal(arr.length,1);
 assert.equal(arr[0].start_ms,1794182400000);
 assert.throws(()=>parseBootWindows({}));
});

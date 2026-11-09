import test from "node:test";
import assert from "node:assert/strict";
import {NhplugApiError} from "../dist/client.js";
import {classifyCaptureError,formulateRecoveryPlan} from "../dist/capture-recovery.js";
const err=(category,status)=>new NhplugApiError("SENSITIVE_ACCOUNT_1234",{
 category,status,path:"/krstock/inquiry/v1/balance",retryable:false,environment:"TEST"});
test("API auth, rate limit and network failures are distinct and never automatically retried",()=>{
 const cases=[["auth","AUTH_REQUIRES_REVIEW"],["rate_limit","BROKER_RATE_LIMIT"],
 ["network","NETWORK_UNAVAILABLE"],["http","BROKER_HTTP_FAILURE"]];
 for(const [input,expected] of cases){
  const d=classifyCaptureError(err(input, input==="rate_limit"?429:401));
  assert.equal(d.kind,expected);
  assert.equal(d.automatic_retry_allowed,false);
  assert.equal(JSON.stringify(d).includes("SENSITIVE_ACCOUNT_1234"),false);
 }
});
test("storage, pagination and broker business response errors are recognized safely",()=>{
 assert.equal(classifyCaptureError(Object.assign(Error("permission"),{code:"EACCES"})).kind,"STORAGE_PERMISSION_OR_INTEGRITY");
 assert.equal(classifyCaptureError(Error("연속조회 불완전: repeated_continuation_cursor")).kind,"SOURCE_PAGINATION_INCOMPLETE");
 assert.equal(classifyCaptureError(Error("잔고 API 업무 상태 불확실")).kind,"BROKER_BUSINESS_RESPONSE_UNEXPECTED");
 assert.equal(classifyCaptureError(Error("SECRET_ACCOUNT=123")).kind,"UNKNOWN_FAILURE");
});
test("before schedule missing today is not an invitation to retry",()=>{
 const r=formulateRecoveryPlan(["2026-11-08"],["2026-11-09"],"2026-11-09","09:55","PENDING_VALIDATION_WINDOW");
 assert.equal(r.targets[0].decision,"WAIT_FOR_SCHEDULE");
 assert.equal(r.targets[1].decision,"ALREADY_CAPTURED_NO_ACTION");
 assert.equal(r.automatic_broker_retry_allowed,false);
});
test("after schedule only missing target is eligible for human review; historical backfill remains off",()=>{
 const r=formulateRecoveryPlan(["2026-11-08"],["2026-11-09"],"2026-11-09","21:00","CAPTURE_INTEGRITY_REVIEW_REQUIRED");
 assert.equal(r.targets[0].decision,"ELIGIBLE_FOR_MANUAL_REVIEW");
 assert.equal(r.targets[1].decision,"ALREADY_CAPTURED_NO_ACTION");
 assert.equal(r.historical_backfill_allowed,false);
 assert.equal(r.investment_return_available,false);
});

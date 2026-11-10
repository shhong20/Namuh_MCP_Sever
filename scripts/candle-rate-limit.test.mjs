import test from "node:test";
import assert from "node:assert/strict";
import {quoteRateLimitReached} from "../dist/tax-safety.js";
test("broker APP call cap recognized from business response",()=>{
 assert.equal(quoteRateLimitReached({rsp_cd:"90001",rsp_msg:"APP 호출 거래건수를 초과하였습니다."}),true);
 assert.equal(quoteRateLimitReached({rsp_cd:"00000",rsp_msg:"조회완료"}),false);
});
test("HTTP 429 recognized but regular network errors are not assumed rate limits",()=>{
 assert.equal(quoteRateLimitReached({detail:{category:"rate_limit",status:429}}),true);
 assert.equal(quoteRateLimitReached({detail:{category:"network",status:503}}),false);
});

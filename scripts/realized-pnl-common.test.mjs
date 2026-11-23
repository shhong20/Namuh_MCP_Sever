import test from "node:test";
import assert from "node:assert/strict";
import {commonPeriodInput,normalizeCommonPeriod} from "../dist/realized-pnl-common.js";

test("new common period PnL requests isolate domestic KRW and US USD",()=>{
 const kr=commonPeriodInput("12345678901","20261101","20261123","KR","KRW");
 const us=commonPeriodInput("12345678901","20261101","20261123","US","USD");
 assert.equal(kr.dmt_ose_dit_cd,"1");
 assert.equal(kr.iqr_dit,"2");
 assert.equal(kr.fc_sec_trd_nat_cd,"000");
 assert.equal(us.dmt_ose_dit_cd,"2");
 assert.equal(us.iqr_dit,"1");
 assert.equal(us.cur_cd,"USD");
 assert.throws(()=>commonPeriodInput("12345678901","20261101","20261123","KR","USD"));
 assert.throws(()=>commonPeriodInput("bad","20261101","20261123","US","USD"));
});
test("verified common-period response reads Output_1 totals and Output_0 daily rows",()=>{
 const kr=normalizeCommonPeriod({
  rsp_cd:"00166",Output_1:{fc_rzt_pls_sum:-1480170},
  Output_0:[{orr_dt:"20261109",cur_cd:"KRW",rzt_pls_amt:-1480170}]
 },"KR");
 assert.equal(kr.reported_realized,-1480170);
 assert.equal(kr.records.length,1);
 assert.equal(kr.currency,"KRW");
 assert.equal(kr.broker_full_period_verified,false);
});
test("no data and malformed legacy shapes never invent tax basis",()=>{
 const empty=normalizeCommonPeriod({rsp_cd:"13578",Output_0:[]},"US");
 assert.equal(empty.reported_realized,null);
 assert.equal(empty.records.length,0);
 assert.throws(()=>normalizeCommonPeriod({rsp_cd:"00166",Output_0:{fc_rzt_pls_sum:0},Output_1:[]},"US"),/ROWS_NOT_ARRAY/);
 assert.throws(()=>normalizeCommonPeriod({rsp_cd:"00166",Output_0:[{orr_dt:"20261110",cur_cd:"KRW",rzt_pls_amt:0}],Output_1:{fc_rzt_pls_sum:0}},"US"),/CURRENCY/);
 assert.throws(()=>normalizeCommonPeriod({rsp_cd:"00166",Output_0:[],Output_1:{}}, "KR"),/MISSING_REALIZED_SUM/);
 assert.throws(()=>normalizeCommonPeriod({rsp_cd:"BAD",Output_0:[]}, "KR"),/BROKER_CODE/);
});

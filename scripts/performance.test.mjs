import test from "node:test";
import assert from "node:assert/strict";
import { realizedSummary, cashFlowClassifications, modifiedDietz, verifyBrokerResponse } from "../dist/performance.js";

test("realized PnL is kept in separate currencies and cash flows are not assumed",()=>{
 const s=realizedSummary(
  {Output_0:{pls_amt_sum:-12000},Output_1:[{sby_dt:"20261102",pls_amt:-12000}]},
  {Output_0:{fc_rzt_pls_sum:24.5},Output_1:[{orr_dt:"20261103",trd_cur_cd:"USD",fc_rzt_pls:24.5}]}
 );
 assert.equal(s.domestic_realized_krw,-12000);
 assert.equal(s.foreign_realized_usd,24.5);
 assert.equal(s.foreign_krw_realized,null);
 assert.equal(s.domestic_daily_records.length,1);
});
test("external cash flows are separate from buy sell and dividend",()=>{
 const r=cashFlowClassifications([
  {sps_cd_nm:"외화배당금입금"},
  {sps_cd_nm:"외화증권매수"},
  {sps_cd_nm:"외화증권매도"},
  {sps_cd_nm:"외화입금"},
  {sps_cd_nm:"외화출금"},
  {sps_cd_nm:"해외주식 권리 변경"},
 ]);
 assert.deepEqual([r.dividend_deposits,r.security_buys,r.security_sells,r.explicit_external_deposits,r.explicit_external_withdrawals,r.unclassified],[1,1,1,1,1,1]);
});
test("return is withheld if verified net assets or external cash flows are incomplete",()=>{
 const common={opening_nav_krw:1000000,closing_nav_krw:1150000,total_days:30,flows:[{day_offset:15,external_flow_krw:100000}]};
 assert.equal(modifiedDietz({...common,verified_full_account_nav:false,complete_external_flows:true}).rate_pct,null);
 assert.equal(modifiedDietz({...common,verified_full_account_nav:true,complete_external_flows:false}).rate_pct,null);
 const p=modifiedDietz({...common,verified_full_account_nav:true,complete_external_flows:true});
 assert.equal(p.available,true);
 assert.equal(p.gain_krw,50000);
 assert.equal(p.rate_pct,4.76);
 assert.throws(()=>modifiedDietz({...common,total_days:0,verified_full_account_nav:true,complete_external_flows:true}));
});
test("broker business response codes are per operation",()=>{
 verifyBrokerResponse({rsp_cd:"11512"},"domesticRealized");
 verifyBrokerResponse({rsp_cd:"13578"},"foreignTransactions");
 assert.throws(()=>verifyBrokerResponse({rsp_cd:"IGW42902"},"domesticRealized"));
 assert.throws(()=>verifyBrokerResponse({rsp_cd:"11512"},"foreignTransactions"));
});

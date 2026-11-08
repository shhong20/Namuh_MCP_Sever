import test from "node:test";
import assert from "node:assert/strict";
import {collectCommonPages,redactedCommonRows,summarizeCommonLedger} from "../dist/common-ledger.js";

const page=(code,rows,cts=null,flag="N")=>({data:{rsp_cd:code,Output_0:rows},continuation:{cts,flag}});
test("common API Output_0 array pages and cts_flag correctly collected",async()=>{
  const seen=[];
  const r=await collectCommonPages(async(cts,flag)=>{
    seen.push([cts??null,flag??null]);
    return cts?page("00166",[{trd_dt:"20261102",trd_amt:11}]):page("00218",[{trd_dt:"20261101",trd_amt:10}],"opaque", "Y");
  });
  assert.deepEqual(seen,[[null,null],["opaque","Y"]]);
  assert.equal(r.audit.complete,true);
  assert.equal(r.audit.row_count,2);
  assert.equal(r.audit.page_count,2);
  assert.equal(JSON.stringify(r.audit).includes("opaque"),false);
});
test("empty deposit history with 13578 is valid terminal result",async()=>{
  const r=await collectCommonPages(async()=>page("13578",[],"unused","N"));
  assert.equal(r.audit.complete,true);
  assert.equal(r.rows.length,0);
});
test("missing continuation and duplicate pages do not claim completeness",async()=>{
  const a=await collectCommonPages(async()=>page("00218",[{trd_dt:"20261101"}],null,"Y"));
  assert.equal(a.audit.complete,false);
  assert.equal(a.audit.failure_reason,"missing_or_invalid_continuation");
  const b=await collectCommonPages(async(c)=>page(c?"00166":"00218",[{trd_dt:"20261101"}],"C","Y"));
  assert.equal(b.audit.complete,false);
  assert.equal(b.audit.failure_reason,"duplicate_rows_unresolved");
});
test("redaction excludes counterparty, customer, account and freeform notes",()=>{
 const r=redactedCommonRows([{
 trd_dt:"20261102",trd_amt:2000,trd_af_dca:3000,act_trd_tp_nm:"입금",
 sps_cd_krl_anm:"자금입금",opi_cus_fnm:"PRIVATE_NAME",
 cli_pe_fnm:"PRIVATE_SENDER",rks4:"secret note",act_no:"PRIVATE_ACCOUNT"
 }],"deposit");
 const output=JSON.stringify(r);
 assert.ok(!output.includes("PRIVATE_"));
 assert.ok(!output.includes("secret note"));
 assert.ok(!output.includes("3000"));
 assert.equal(r[0].currency,"UNSPECIFIED");
 assert.equal(r[0].externally_verified,false);
});
test("even all-complete sources never claim investor deposits or returns",()=>{
 const a={rows:[{trd_dt:"20261101",trd_amt:3000,act_trd_tp_nm:"입금",sps_cd_krl_anm:"입금"}],
 audit:{complete:true,page_count:1,row_count:1,duplicate_count:0,response_codes:["00166"],failure_reason:null}};
 const b={rows:[{trd_dt:"20261101",cur_cd:"KRW",trd_amt:3000,sps_cd_krl_anm:"자금이체"}],
 audit:{complete:true,page_count:1,row_count:1,duplicate_count:0,response_codes:["00166"],failure_reason:null}};
 const result=summarizeCommonLedger(a,b,"2026-11");
 assert.equal(result.all_source_pages_complete,true);
 assert.equal(result.verified_net_external_flow_krw,null);
 assert.equal(result.ready_for_portfolio_return,false);
 assert.equal(result.counts.candidate_inflows,1);
});

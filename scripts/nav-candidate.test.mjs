import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,chmod,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {makeNavCandidate,saveNavCandidate,listNavCandidates,navCandidateHistory} from "../dist/nav-candidate.js";

function collected(complete=true,summary={nas_amt:7928607,tot_aet_amt:7928607},rows=[{eal_amt:5000000},{eal_amt:3625251}]) {
 return {data:{rsp_cd:"00166",rsp_msg:"",Output_0:summary,Output_1:rows},
  audit:{complete,page_count:2,rows_collected:rows.length,codes:["00218","00166"],duplicate_rows:0, cursor_present_on_continuation:true,failure_reason:null}};
}
test("complete pages produce explicitly unverified NAV candidate, not a return",()=>{
 const c=makeNavCandidate(collected(),"2026-11-09","2026-11-09T10:00:00Z");
 assert.equal(c.reported_net_assets_krw,7928607);
 assert.equal(c.reconciliation_delta_krw,696644);
 assert.equal(c.reconciliation_status,"DIFFERENCE_REQUIRES_REVIEW");
 assert.equal(c.verified_full_nav,false);
 assert.equal(c.usable_for_investment_return,false);
 assert.equal(JSON.stringify(c).includes("act_no"),false);
});
test("missing or partial pages fail closed",()=>{
 assert.throws(()=>makeNavCandidate(collected(false)));
 assert.throws(()=>makeNavCandidate(collected(true,{nas_amt:0,tot_aet_amt:0})));
 assert.throws(()=>makeNavCandidate(collected(true,{nas_amt:1000,tot_aet_amt:1000},[{eal_amt:"bad"}])));
});
test("candidate snapshots are private, date immutable, separate from holdings",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"nav-candidate-"));
 await chmod(dir,0o700);
 process.env.NAMUH_NAV_CANDIDATE_DIR=dir;
 try {
  const c=makeNavCandidate(collected(),"2026-11-09");
  assert.equal((await saveNavCandidate(c)).created,true);
  const altered={...c,reported_net_assets_krw:999};
  assert.equal((await saveNavCandidate(altered)).created,false);
  const rows=await listNavCandidates();
  assert.equal(rows.length,1);
  assert.equal(rows[0].reported_net_assets_krw,7928607);
  const s=await stat(join(dir,"2026-11-09.json"));
  assert.equal(s.mode&0o777,0o600);
  const hist=await navCandidateHistory("2026-11");
  assert.equal(hist.investor_return_available,false);
  assert.equal(hist.verified_nav_observations,0);
 } finally{
  delete process.env.NAMUH_NAV_CANDIDATE_DIR;
  await rm(dir,{recursive:true,force:true});
 }
});

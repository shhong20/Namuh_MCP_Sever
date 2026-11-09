import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,chmod,readFile,readdir,rm,stat,symlink,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createSnapshot,saveSnapshot,listSnapshots,captureDailyWithSources} from "../dist/history.js";
import {makeNavCandidate,saveNavCandidate,listNavCandidates,captureNavWithSources} from "../dist/nav-candidate.js";
import {NhplugApiError} from "../dist/client.js";
import {classifyCaptureError} from "../dist/capture-recovery.js";

const DATE="2026-11-09";
const err=(category)=>new NhplugApiError("SECRET_ACCOUNT_AND_TOKEN",{category,path:"/mock",status:category==="rate_limit"?429:401,retryable:false,environment:"isolation"});
function overview(value=1200){return {
 market_value_krw:value,position_unrealized_pnl_krw:10,domestic_securities_krw:value,
 us_securities_krw:0,positions:[]};}
const holdings=()=>createSnapshot(overview(),DATE,"2026-11-09T11:30:00Z");
function navCandidate(value=3000){
 const data={data:{Output_0:{nas_amt:value,tot_aet_amt:value,
 krw_tsl_fc_dca:0,krw_tsl_fc_mgg_amt:0,krw_tsl_fc_orr_pbl_amt:0},
 Output_1:[{iem_mlf_nm:"주식",eal_amt:value}]},
 audit:{complete:true,page_count:1,duplicate_rows:0,codes:["00166"]}};
 return makeNavCandidate(data,DATE,"2026-11-09T11:40:00Z");
}
function navSource(response){
 let calls=0;
 return {source:{
  account:async()=>{calls++;return "FAKE_ISOLATED_ACCOUNT";},
  page:async()=>{calls++;return response;}
 },calls:()=>calls};
}
const validPage=(value=3000)=>({data:{rsp_cd:"00166",Output_0:{
 nas_amt:value,tot_aet_amt:value,krw_tsl_fc_dca:0,krw_tsl_fc_mgg_amt:0,krw_tsl_fc_orr_pbl_amt:0},
 Output_1:[{iem_mlf_nm:"주식",eal_amt:value}]},
 continuation:{cts:null,flag:"N"}});
async function isolated(fn){
 const root=await mkdtemp(join(tmpdir(),"nhplug-isolated-fault-"));
 await chmod(root,0o700);
 const h=join(root,"stocks"),n=join(root,"nav");
 await Promise.all([chmod(root,0o700)]);
 process.env.NAMUH_PORTFOLIO_SNAPSHOT_DIR=h;
 process.env.NAMUH_NAV_CANDIDATE_DIR=n;
 try{await fn({root,h,n});}
 finally {
  delete process.env.NAMUH_PORTFOLIO_SNAPSHOT_DIR;
  delete process.env.NAMUH_NAV_CANDIDATE_DIR;
  await rm(root,{recursive:true,force:true});
 }
}
const fakeBroker=(mode)=>{
 let invoked=0;
 const fail=async()=>{invoked++;throw err(mode);};
 return {sources:{account:fail,domestic:fail,overseas:fail},calls:()=>invoked};
};
test("AUTH and RATE_LIMIT injections do not create holdings files or retry; pre-existing holdings stay unchanged",async()=>{
 await isolated(async({h})=>{
  const stored=holdings();
  assert.equal((await saveSnapshot(stored)).created,true);
  const path=join(h,DATE+".json");
  const orig=await readFile(path);
  for(const kind of ["auth","rate_limit","network"]){
    const x=fakeBroker(kind);
    const result=await captureDailyWithSources(x.sources,DATE);
    assert.equal(result.created,false);
    assert.equal(x.calls(),0,"already captured day must not contact simulated broker");
  }
  const fresh="2026-11-10";
  for(const kind of ["auth","rate_limit","network"]){
    const x=fakeBroker(kind);
    await assert.rejects(captureDailyWithSources(x.sources,fresh));
    assert.equal(x.calls(),1,"no retries on source failures");
    assert.equal(classifyCaptureError(err(kind)).automatic_retry_allowed,false);
  }
  assert.deepEqual(await readFile(path),orig);
  assert.deepEqual((await readdir(h)).sort(),[DATE+".json"]);
 });
});
test("concurrent holdings writes create exactly one immutable original, no orphan temp files",async()=>{
 await isolated(async({h})=>{
   const same=Array.from({length:20},(_,i)=>createSnapshot(overview(1000+i),DATE));
   const results=await Promise.all(same.map(s=>saveSnapshot(s)));
   assert.equal(results.filter(x=>x.created).length,1);
   const got=await listSnapshots();
   assert.equal(got.length,1);
   assert.equal((await readdir(h)).length,1);
   assert.equal((await stat(join(h,DATE+".json"))).mode&0o777,0o600);
 });
});
test("NAV auth/rate-limit and incomplete cursor never save partial files",async()=>{
 await isolated(async({n})=>{
  for(const kind of ["auth","rate_limit"]){
    let calls=0;
    const src={account:async()=>{calls++;return "FAKE";},
      page:async()=>{calls++;throw err(kind);}};
    await assert.rejects(captureNavWithSources(src,DATE));
    assert.equal(calls,2,"one account and one page, no automatic retry");
  }
  let calls=0;
  await assert.rejects(captureNavWithSources({
    account:async()=> "FAKE",
    page:async()=>{calls++;return {
      data:{rsp_cd:"00218",Output_0:{nas_amt:1000,tot_aet_amt:1000},
      Output_1:[{eal_amt:1000}]},continuation:{cts:null,flag:null}};}
  },DATE),/연속조회 불완전/);
  assert.equal(calls,1);
  assert.deepEqual(await listNavCandidates(),[]);
  // The NAV directory can be absent because failed fetch should not create it.
  const files=await readdir(n).catch(e=>e.code==="ENOENT"?[]:Promise.reject(e));
  assert.deepEqual(files,[]);
 });
});
test("concurrent NAV candidate saves are immutable and redact broker identity",async()=>{
 await isolated(async({n})=>{
  const res=await Promise.all(Array.from({length:20},(_,i)=>saveNavCandidate(navCandidate(3000+i))));
  assert.equal(res.filter(x=>x.created).length,1);
  assert.equal((await listNavCandidates()).length,1);
  assert.equal((await readdir(n)).length,1);
  const path=join(n,DATE+".json");
  const bytes=await readFile(path,"utf8");
  assert.equal(bytes.includes("FAKE_ISOLATED_ACCOUNT"),false);
  assert.equal((await stat(path)).mode&0o777,0o600);
 });
});
test("bad storage permissions and symlink paths are rejected without modifying existing target",async()=>{
 await isolated(async({root,h,n})=>{
   await chmod(root,0o700);
   await writeFile(join(root,"keep.txt"),"PRESERVE");
   await symlink(root,h);
   await assert.rejects(saveSnapshot(holdings()),/권한|안전하지/);
   await symlink(root,n);
   await assert.rejects(saveNavCandidate(navCandidate()),/권한|안전하지/);
   assert.equal(await readFile(join(root,"keep.txt"),"utf8"),"PRESERVE");
   assert.deepEqual((await readdir(root)).sort(),["keep.txt","nav","stocks"]);
 });
});

test("second brokerage response failure leaves no partial holdings and no account secrets",async()=>{
 await isolated(async({h})=>{
  let domesticCalls=0,overseasCalls=0;
  const src={
   account:async()=> "FAKE_ONLY",
   domestic:async()=>{domesticCalls++;return {rsp_cd:"00166",Output_0:{},Output_1:[{iem_cd:"FAKE",iem_nm:"TEST",eal_amt:1000}]};},
   overseas:async()=>{overseasCalls++;throw err("network");}
  };
  await assert.rejects(captureDailyWithSources(src,DATE));
  assert.equal(domesticCalls,1);
  assert.equal(overseasCalls,1);
  const files=await readdir(h).catch(e=>e.code==="ENOENT"?[]:Promise.reject(e));
  assert.deepEqual(files,[]);
 });
});
test("NAV repeated continuation cursor fails closed and does not persist a partial snapshot",async()=>{
 await isolated(async({n})=>{
   let calls=0;
   const page=async(_act_no,cts,flag)=>{
     calls++;
     if(calls===1)assert.equal(cts,undefined);
     if(calls>1)assert.equal(flag,"Y");
     return {data:{rsp_cd:"00218",Output_0:{nas_amt:2000,tot_aet_amt:2000},
       Output_1:[{iem_mlf_nm:"주식",eal_amt:2000+calls}]},
       continuation:{cts:"reused-cursor",flag:"Y"}};
   };
   await assert.rejects(captureNavWithSources({account:async()=>"FAKE",page},DATE),/연속조회 불완전/);
   assert.equal(calls,2);
   assert.equal((await listNavCandidates()).length,0);
   const files=await readdir(n).catch(e=>e.code==="ENOENT"?[]:Promise.reject(e));
   assert.deepEqual(files,[]);
 });
});
test("ENOSPC storage fault is separately classified; existing file stays immutable",async()=>{
 await isolated(async({h})=>{
   await saveSnapshot(holdings());
   const stored=await readFile(join(h,DATE+".json"));
   const diskFault=Object.assign(Error("simulated disk full"),{code:"ENOSPC"});
   const result=classifyCaptureError(diskFault);
   assert.equal(result.kind,"STORAGE_PERMISSION_OR_INTEGRITY");
   assert.equal(result.automatic_retry_allowed,false);
   assert.deepEqual(await readFile(join(h,DATE+".json")),stored);
 });
});

test("a previously saved snapshot remains unchanged under invalid destination directory permissions",async()=>{
 await isolated(async({h})=>{
   const s=holdings();
   await saveSnapshot(s);
   const original=await readFile(join(h,DATE+".json"));
   await chmod(h,0o755);
   await assert.rejects(saveSnapshot({...s,holdings_value_krw:99999}),/권한|안전하지/);
   assert.deepEqual(await readFile(join(h,DATE+".json")),original);
 });
});

import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,readdirSync,statSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

function run(home,script){
 const r=spawnSync(process.execPath,["--input-type=module","-e",script],{
  env:{...process.env,HOME:home},cwd:process.cwd(),encoding:"utf8",timeout:10000
 });
 assert.equal(r.status,0, r.stderr?.slice(0,1200)+" "+r.stdout?.slice(0,1200));
 return JSON.parse(r.stdout.trim());
}
const config={appKey:"mock-key",appSecret:"mock-secret",authUrl:"https://api.nhplug.com:8443",baseUrl:"https://api.nhplug.com:8443",enableTrading:false,defaultAccount:""};

test("same-process burst singleflight and cross-process cache reuse",()=>{
 const home=mkdtempSync(join(tmpdir(),"nh-token-safe-test-"));
 try{
  const setup=`import {getAccessToken} from './dist/auth.js';
const c=${JSON.stringify(config)};
let calls=0;
globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({access_token:'fake-token-123',expires_in:7200}),{status:200})};
`;
  const first=run(home,setup+"const a=await Promise.all(Array.from({length:12},()=>getAccessToken(c)));console.log(JSON.stringify({calls,same:a.every(t=>t==='fake-token-123')}));");
  assert.deepEqual(first,{calls:1,same:true});
  const second=run(home,setup+"const token=await getAccessToken(c);console.log(JSON.stringify({calls,reused:token==='fake-token-123'}));");
  assert.deepEqual(second,{calls:0,reused:true});
  const dir=join(home,".local","state","namuh-mcp");
  assert.equal(statSync(dir).mode&0o777,0o700);
  const files=readdirSync(dir);
  assert.equal(files.length,1);
  assert.equal(statSync(join(dir,files[0])).mode&0o777,0o600);
  const data=readFileSync(join(dir,files[0]),"utf8");
  assert.ok(!data.includes("mock-key"));
  assert.ok(!data.includes("mock-secret"));
 }finally{rmSync(home,{recursive:true,force:true})}
});
test("invalidated token is not reused across separate process",()=>{
 const home=mkdtempSync(join(tmpdir(),"nh-token-clear-test-"));
 try{
  const setup=`import {getAccessToken,clearTokenCache} from './dist/auth.js';
const c=${JSON.stringify(config)};
let calls=0;
globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({access_token:'refreshed-'+calls,expires_in:7200}),{status:200})};
`;
  const a=run(home,setup+"const before=await getAccessToken(c);await clearTokenCache(c);const after=await getAccessToken(c,true);console.log(JSON.stringify({before,after,calls}));");
  assert.deepEqual(a,{before:"refreshed-1",after:"refreshed-2",calls:2});
  const b=run(home,setup+"const after=await getAccessToken(c);console.log(JSON.stringify({after,calls}));");
  assert.deepEqual(b,{after:"refreshed-2",calls:0});
 }finally{rmSync(home,{recursive:true,force:true})}
});
test("different credentials cannot share cached token",()=>{
 const home=mkdtempSync(join(tmpdir(),"nh-token-scope-test-"));
 try{
  const script=`import {getAccessToken} from './dist/auth.js';
const c=${JSON.stringify(config)};
let calls=0;
globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({access_token:'token-'+calls,expires_in:7200}),{status:200})};
const a=await getAccessToken(c);const b=await getAccessToken({...c,appKey:"other"});
console.log(JSON.stringify({a,b,calls}));
`;
  assert.deepEqual(run(home,script),{a:"token-1",b:"token-2",calls:2});
 }finally{rmSync(home,{recursive:true,force:true})}
});

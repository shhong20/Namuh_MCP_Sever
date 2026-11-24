import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const c={appKey:"TEST_KEY",appSecret:"TEST_SECRET",authUrl:"https://api.nhplug.com:8443",baseUrl:"https://api.nhplug.com:8443",enableTrading:false,defaultAccount:""};
const setup='import {getAccessToken,tokenCacheStatus} from "./dist/auth.js";import {callRest} from "./dist/client.js";import {validateUrl} from "./dist/config.js";import assert from "node:assert/strict";const c='+JSON.stringify(c)+';';
function child(home,code){
 const p=spawn(process.execPath,["--input-type=module","-e",setup+code],{env:{...process.env,HOME:home},stdio:["ignore","pipe","pipe"]});
 let out="",err="";p.stdout.on("data",x=>out+=x);p.stderr.on("data",x=>err+=x);
 const done=once(p,"close").then(([status])=>({status,out,err}));
 return {p,done};
}
async function run(home,code){const r=await child(home,code).done;assert.equal(r.status,0,r.err);return r;}
test("official origin, proxy and redirects fail closed; status does not issue",async()=>{
 const home=mkdtempSync(join(tmpdir(),"nh-security-"));
 try{
 const r=await run(home,`for(const u of ["https://evil.invalid:8443","http://api.nhplug.com:8443","https://api.nhplug.com:443","https://x@api.nhplug.com:8443","https://api.nhplug.com:8443?key=x"])assert.throws(()=>validateUrl(u,"NHPLUG_AUTH_URL"));
 process.env.NHPLUG_ALLOW_HOSTS="evil.invalid";assert.throws(()=>validateUrl(c.authUrl,"NHPLUG_AUTH_URL"));delete process.env.NHPLUG_ALLOW_HOSTS;
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error("unexpected")};const st=await tokenCacheStatus(c);assert.equal(st.disk_valid,false);assert.equal(calls,0);
 process.env.HTTPS_PROXY="https://evil.invalid";await assert.rejects(getAccessToken(c),/NH_UNSAFE_TRANSPORT_ENV/);delete process.env.HTTPS_PROXY;
 globalThis.fetch=async(u,o)=>{calls++;assert.equal(o.redirect,"manual");return new Response("",{status:307,headers:{location:"https://evil.invalid"}})};await assert.rejects(getAccessToken(c),/NH_REDIRECT_BLOCKED/);assert.equal(calls,1);
 globalThis.fetch=async(u,o)=>{calls++;assert.equal(o.redirect,"manual");return String(u).includes("/oauth2/token")?new Response(JSON.stringify({access_token:"TEST_TOKEN",expires_in:7200})):new Response("",{status:302,headers:{location:"https://evil.invalid"}})};
 await assert.rejects(callRest(c,"/test",{}),/NH_REDIRECT_BLOCKED/);assert.equal(calls,3);await assert.rejects(callRest(c,"//evil.invalid",{}));assert.equal(calls,3);
 console.log(JSON.stringify(await tokenCacheStatus(c)));`);
 for(const secret of ["TEST_KEY","TEST_SECRET","TEST_TOKEN","evil.invalid"])assert.ok(!(r.out+r.err).includes(secret));
 assert.equal(JSON.parse(r.out).disk_valid,true);
 }finally{rmSync(home,{recursive:true,force:true});}
});
test("concurrent processes issue one token",async()=>{
 const home=mkdtempSync(join(tmpdir(),"nh-race-"));
 try{
 const code=`let calls=0;globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,350));return new Response(JSON.stringify({access_token:"TEST_TOKEN",expires_in:7200}))};assert.equal(await getAccessToken(c),"TEST_TOKEN");console.log(calls);`;
 const result=await Promise.all(Array.from({length:5},()=>run(home,code)));assert.equal(result.reduce((a,r)=>a+Number(r.out),0),1);
 }finally{rmSync(home,{recursive:true,force:true});}
});
test("SIGKILL releases token lock",async()=>{
 const home=mkdtempSync(join(tmpdir(),"nh-crash-"));let p;
 try{
 const x=child(home,`globalThis.fetch=async()=>{console.log("LOCKED");await new Promise(()=>{});};setInterval(()=>{},1000);await getAccessToken(c);`);p=x.p;
 await Promise.race([once(p.stdout,"data"),x.done.then(()=>{throw Error("child exited")})]);
 p.kill("SIGKILL");await x.done;
 const r=await run(home,`globalThis.fetch=async()=>new Response(JSON.stringify({access_token:"TEST_TOKEN",expires_in:7200}));assert.equal(await getAccessToken(c),"TEST_TOKEN");console.log("recovered");`);assert.match(r.out,/recovered/);
 }finally{if(p&&!p.killed)p.kill("SIGKILL");rmSync(home,{recursive:true,force:true});}
});

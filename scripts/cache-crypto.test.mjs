import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {seal,unseal} from "../dist/cache-crypto.js";
import {createHash} from "node:crypto";
const c={appKey:"test-app",appSecret:"test-secret",authUrl:"https://api.nhplug.com:8443",baseUrl:"https://api.nhplug.com:8443",enableTrading:false,defaultAccount:""};
const scope=createHash("sha256").update(JSON.stringify([c.authUrl,c.baseUrl,c.appKey,c.appSecret])).digest("hex").slice(0,32);
test("AES cache authenticated encryption and wrong key rejection",()=>{
 const x={scope,token:"SYNTHETIC_TOKEN",expiresAt:Date.now()+3600000};
 const sealed=seal(x,c.appSecret,scope,"aes-gcm-v1");
 assert.ok(!JSON.stringify(sealed).includes(x.token));
 assert.deepEqual(unseal(sealed,c.appSecret,scope,"aes-gcm-v1").value,x);
 assert.throws(()=>unseal(sealed,"wrong",scope,"aes-gcm-v1"),/DECRYPT_FAILED/);
 assert.throws(()=>unseal({...sealed,tag:Buffer.alloc(16).toString("base64")},c.appSecret,scope,"aes-gcm-v1"),/DECRYPT_FAILED/);
});
test("legacy cache migrates atomically and keeps expiry; tampered cache does not issue",()=>{
 const home=mkdtempSync(join(tmpdir(),"nh-crypto-"));
 try{
 const dir=join(home,".local/state/namuh-mcp");mkdirSync(dir,{recursive:true,mode:0o700});
 const expiresAt=Date.now()+3600000,file=join(dir,"token-"+scope+".json");
 writeFileSync(file,JSON.stringify({scope,token:"SYNTHETIC_TOKEN",expiresAt}),{mode:0o600});
 const run=(tamper=false)=>spawnSync(process.execPath,["--input-type=module","-e",
 `import {getAccessToken,tokenCacheStatus} from "./dist/auth.js";import assert from "node:assert/strict";const c=${JSON.stringify(c)};globalThis.fetch=()=>{throw Error("network forbidden")};`+
 (tamper?`await assert.rejects(getAccessToken(c),/CACHE_DECRYPT_FAILED/)`:`assert.equal(await getAccessToken(c),"SYNTHETIC_TOKEN");const s=await tokenCacheStatus(c);assert.equal(s.cache_format,"aes-gcm-v1");assert.equal(Date.parse(s.expires_at),${expiresAt})`)],{env:{...process.env,HOME:home},encoding:"utf8",timeout:12000});
 let p=run();assert.equal(p.status,0,p.stderr);
 const raw=readFileSync(file,"utf8");assert.ok(!raw.includes("SYNTHETIC_TOKEN"));
 const obj=JSON.parse(raw);obj.tag=Buffer.alloc(16).toString("base64");writeFileSync(file,JSON.stringify(obj));
 p=run(true);assert.equal(p.status,0,p.stderr);
 }finally{rmSync(home,{recursive:true,force:true})}
});

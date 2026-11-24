import {brokerFetch} from "./relay-transport.js";
import {validateUrl,assertSecureTransport,type Config} from "./config.js";
import {createHash,randomBytes} from "node:crypto";
import {mkdir,lstat,readFile,open,rename,unlink} from "node:fs/promises";
import {homedir} from "node:os";
import {join} from "node:path";
import {constants} from "node:fs";
import {spawn} from "node:child_process";
import {seal,unseal,type Protection} from "./cache-crypto.js";

type TokenState={scope:string;token:string;expiresAt:number;scheme?:string};
let cached:TokenState|null=null;
const inflight=new Map<string,Promise<string>>();
const SKEW=60_000;
const dir=()=>join(homedir(),".local","state","namuh-mcp");
const scopeOf=(c:Config)=>createHash("sha256").update(JSON.stringify([c.authUrl,c.baseUrl,c.appKey,c.appSecret])).digest("hex").slice(0,32);
const fileOf=(scope:string)=>join(dir(),"token-"+scope+".json");

async function protectedDir(){
 await mkdir(dir(),{recursive:true,mode:0o700});
 const st=await lstat(dir());
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.uid!==process.getuid?.())
  throw new Error("NH_CACHE_DIR_PERMISSIONS_INVALID");
}
async function protectedFile(path:string){
 try {
  const st=await lstat(path);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.uid!==process.getuid?.())
   throw new Error("NH_CACHE_FILE_PERMISSIONS_INVALID");
  return true;
 }catch(e:any){if(e?.code==="ENOENT")return false;throw e;}
}
async function protection():Promise<Protection>{
 await protectedDir();
 const marker=join(dir(),"host-protection");
 if(!await protectedFile(marker))return "aes-gcm-v1";
 if((await readFile(marker,"utf8")).trim()!=="systemd-host-v1")throw Error("NH_CACHE_PROTECTION_INVALID");
 return "systemd-host-v1";
}
async function load(c:Config,scope:string):Promise<TokenState|null>{
 await protectedDir();
 const path=fileOf(scope);
 if(!await protectedFile(path))return null;
 let data:any;
 const mode=await protection();
 let scheme:string;
 try{({value:data,scheme}=unseal(JSON.parse(await readFile(path,"utf8")),c.appSecret,scope,mode));}catch{throw new Error("NH_CACHE_DECRYPT_FAILED");}
 if(data?.scope!==scope||typeof data?.token!=="string"||!data.token
  ||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now()+SKEW)return null;
 return {scope,token:data.token,expiresAt:data.expiresAt,scheme};
}
async function save(c:Config,state:TokenState){
 await protectedDir();
 const dest=fileOf(state.scope);
 await protectedFile(dest);
 const tmp=dest+".tmp-"+process.pid+"-"+randomBytes(6).toString("hex");
 const handle=await open(tmp,"wx",0o600);
 try{
  await handle.writeFile(JSON.stringify(seal({scope:state.scope,token:state.token,expiresAt:state.expiresAt},c.appSecret,state.scope,await protection())));
  await handle.sync();
  await handle.close();
  await rename(tmp,dest);
 }finally{
  await handle.close().catch(()=>{});
  await unlink(tmp).catch(()=>{});
 }
}
async function clearDisk(scope:string){
 await protectedDir();
 const path=fileOf(scope);
 if(await protectedFile(path))await unlink(path);
}
function audit(event:string){console.error(JSON.stringify({broker:"NH",event,time:new Date().toISOString()}));}
// Linux flock attaches to the inherited open-file description. The parent
// retains the descriptor until the operation finishes; crashes release it.
async function withLock<T>(scope:string,fn:()=>Promise<T>):Promise<T>{
 await protectedDir();
 const handle=await open(fileOf(scope)+".flock",constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);
 try{
  const st=await handle.stat();
  if(!st.isFile()||(st.mode&0o077)!==0||st.uid!==process.getuid?.())throw new Error("NH_TOKEN_LOCK_INVALID");
  await new Promise<void>((resolve,reject)=>{
   const child=spawn("/usr/bin/flock",["-x","-w","45","3"],{stdio:["ignore","ignore","ignore",handle.fd]});
   child.once("error",()=>reject(new Error("NH_TOKEN_LOCK_UNAVAILABLE")));
   child.once("exit",code=>code===0?resolve():reject(new Error("NH_TOKEN_LOCK_TIMEOUT")));
  });
  return await fn();
 }finally{await handle.close();}
}
async function issue(c:Config,scope:string){
 assertSecureTransport();
 const url=new URL(validateUrl(c.authUrl,"NHPLUG_AUTH_URL")+"/oauth2/token");
 audit("issue_attempt");
 console.error(JSON.stringify({broker:"NH",event:"outbound",kind:"auth",origin:url.origin,path:"/oauth2/token"}));
 url.searchParams.set("appkey",c.appKey);
 url.searchParams.set("appsecretkey",c.appSecret);
 url.searchParams.set("grant_type","client_credentials");
 url.searchParams.set("scope","oob");
 let last="NH_TOKEN_REQUEST_FAILED";
 for(let attempt=0;attempt<3;attempt++){
  let response:Response;
  try{response=await brokerFetch(url,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},redirect:"manual",signal:AbortSignal.timeout(10000)});}
  catch{last="NH_TOKEN_NETWORK_ERROR";if(attempt<2)await new Promise(r=>setTimeout(r,300*(attempt+1)));continue;}
  if(response.status>=300&&response.status<400)throw new Error("NH_REDIRECT_BLOCKED");
  if(response.ok){
   let data:any;
   try{data=await response.json();}catch{throw new Error("NH_TOKEN_INVALID_JSON");}
   const token=data?.access_token??data?.accessToken;
   if(typeof token!=="string"||!token)throw new Error("NH_TOKEN_MISSING");
   const ttl=Number(data?.expires_in??data?.expiresIn??86400);
   if(!Number.isFinite(ttl)||ttl<=0)throw new Error("NH_TOKEN_INVALID_TTL");
   const state={scope,token,expiresAt:Date.now()+Math.min(ttl,86400)*1000};
   await save(c,state);
   cached=state;
   audit("issued");
   return token;
  }
  let code="";
  try{const d:any=await response.json();code=String(d?.error_code??d?.rsp_cd??"");}catch{}
  // Deliberately no URL, body or credential in this error.
  last="NH_TOKEN_HTTP_"+response.status+(code==="IGW40054"?"_IGW40054":"");
  if(code==="IGW40054"&&attempt<2){await new Promise(r=>setTimeout(r,400*(attempt+1)));continue;}
  throw new Error(last);
 }
 throw new Error(last);
}
export async function getAccessToken(c:Config,force=false,failed?:string):Promise<string>{
 assertSecureTransport();
 validateUrl(c.authUrl,"NHPLUG_AUTH_URL");
 validateUrl(c.baseUrl,"NHPLUG_BASE_URL");
 const scope=scopeOf(c);
 if(!force&&cached?.scope===scope&&cached.expiresAt>Date.now()+SKEW){audit("memory_reuse");return cached.token;}
 const current=inflight.get(scope);
 if(current)return current;
 const task=withLock(scope,async()=>{
  const saved=await load(c,scope);
  if(saved&&(!force||(failed!==undefined&&saved.token!==failed))){if(saved.scheme!==await protection()){await save(c,saved);audit("cache_encrypted");}cached=saved;audit("disk_reuse");return saved.token;}
  if(force){if(cached?.scope===scope)cached=null;await clearDisk(scope);audit("revoked");}
  return issue(c,scope);
 });
 inflight.set(scope,task);
 try{return await task;}finally{if(inflight.get(scope)===task)inflight.delete(scope);}
}
export async function clearTokenCache(config?:Config):Promise<void>{
 const scope=config?scopeOf(config):cached?.scope;
 // A revoked token for a different app must not discard this app's healthy cache.
 if(cached?.scope===scope)cached=null;
 if(scope)await withLock(scope,()=>clearDisk(scope));
}
export async function tokenCacheStatus(c:Config){
 const scope=scopeOf(c);
 const disk=await load(c,scope);
 return {read_only:true,auth_origin:validateUrl(c.authUrl,"NHPLUG_AUTH_URL"),api_origin:validateUrl(c.baseUrl,"NHPLUG_BASE_URL"),
         memory_valid:cached?.scope===scope&&cached.expiresAt>Date.now()+SKEW,
         disk_valid:!!disk,expires_at:disk?new Date(disk.expiresAt).toISOString():null,
         cache_protection:await protection(),cache_format:disk?.scheme??null,disk_cache_enabled:true,request_in_flight:inflight.has(scope),redirects_allowed:false};
}

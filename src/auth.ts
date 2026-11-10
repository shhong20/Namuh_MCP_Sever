import type {Config} from "./config.js";
import {createHash,randomBytes} from "node:crypto";
import {mkdir,lstat,readFile,open,rename,unlink} from "node:fs/promises";
import {homedir} from "node:os";
import {join} from "node:path";

type TokenState={scope:string;token:string;expiresAt:number};
let cached:TokenState|null=null;
const inflight=new Map<string,Promise<string>>();
const SKEW=60_000;
const dir=()=>join(homedir(),".local","state","namuh-mcp");
const scopeOf=(c:Config)=>createHash("sha256").update(JSON.stringify([c.authUrl,c.baseUrl,c.appKey,c.appSecret])).digest("hex").slice(0,32);
const fileOf=(scope:string)=>join(dir(),"token-"+scope+".json");

async function protectedDir(){
 await mkdir(dir(),{recursive:true,mode:0o700});
 const st=await lstat(dir());
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
  throw new Error("NH_CACHE_DIR_PERMISSIONS_INVALID");
}
async function protectedFile(path:string){
 try {
  const st=await lstat(path);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)
   throw new Error("NH_CACHE_FILE_PERMISSIONS_INVALID");
  return true;
 }catch(e:any){if(e?.code==="ENOENT")return false;throw e;}
}
async function load(scope:string):Promise<TokenState|null>{
 await protectedDir();
 const path=fileOf(scope);
 if(!await protectedFile(path))return null;
 let data:any;
 try{data=JSON.parse(await readFile(path,"utf8"));}catch{return null;}
 if(data?.scope!==scope||typeof data?.token!=="string"||!data.token
  ||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now()+SKEW)return null;
 return {scope,token:data.token,expiresAt:data.expiresAt};
}
async function save(state:TokenState){
 await protectedDir();
 const dest=fileOf(state.scope);
 await protectedFile(dest);
 const tmp=dest+".tmp-"+process.pid+"-"+randomBytes(6).toString("hex");
 const handle=await open(tmp,"wx",0o600);
 try{
  await handle.writeFile(JSON.stringify(state));
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
async function issue(c:Config,scope:string){
 const url=new URL(c.authUrl+"/oauth2/token");
 url.searchParams.set("appkey",c.appKey);
 url.searchParams.set("appsecretkey",c.appSecret);
 url.searchParams.set("grant_type","client_credentials");
 url.searchParams.set("scope","oob");
 let last="NH_TOKEN_REQUEST_FAILED";
 for(let attempt=0;attempt<3;attempt++){
  let response:Response;
  try{response=await fetch(url,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"}});}
  catch{last="NH_TOKEN_NETWORK_ERROR";if(attempt<2)await new Promise(r=>setTimeout(r,300*(attempt+1)));continue;}
  if(response.ok){
   let data:any;
   try{data=await response.json();}catch{throw new Error("NH_TOKEN_INVALID_JSON");}
   const token=data?.access_token??data?.accessToken;
   if(typeof token!=="string"||!token)throw new Error("NH_TOKEN_MISSING");
   const ttl=Number(data?.expires_in??data?.expiresIn??86400);
   if(!Number.isFinite(ttl)||ttl<=0)throw new Error("NH_TOKEN_INVALID_TTL");
   const state={scope,token,expiresAt:Date.now()+Math.min(ttl,86400)*1000};
   await save(state);
   cached=state;
   return token;
  }
  let code="";
  try{const d:any=await response.json();code=String(d?.error_code??d?.rsp_cd??"");}catch{}
  // Deliberately no URL, body or credential in this error.
  last="NH_TOKEN_HTTP_"+response.status+(code?"_"+code:"");
  if(code==="IGW40054"&&attempt<2){await new Promise(r=>setTimeout(r,400*(attempt+1)));continue;}
  throw new Error(last);
 }
 throw new Error(last);
}
export async function getAccessToken(c:Config,force=false):Promise<string>{
 const scope=scopeOf(c);
 if(!force&&cached?.scope===scope&&cached.expiresAt>Date.now()+SKEW)return cached.token;
 const current=inflight.get(scope);
 if(current)return current;
 const task=(async()=>{
  if(force){cached=null;await clearDisk(scope);}
  else{const saved=await load(scope);if(saved){cached=saved;return saved.token;}}
  return issue(c,scope);
 })();
 inflight.set(scope,task);
 try{return await task;}finally{if(inflight.get(scope)===task)inflight.delete(scope);}
}
export async function clearTokenCache(config?:Config):Promise<void>{
 const scope=config?scopeOf(config):cached?.scope;
 // A revoked token for a different app must not discard this app's healthy cache.
 if(cached?.scope===scope)cached=null;
 if(scope)await clearDisk(scope);
}
export function tokenCacheStatus(c:Config){
 return {memory_valid:cached?.scope===scopeOf(c)&&cached.expiresAt>Date.now()+SKEW,
         disk_cache_enabled:true,request_in_flight:inflight.has(scopeOf(c))};
}

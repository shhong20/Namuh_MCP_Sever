import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";
export type Protection = "systemd-host-v1"|"aes-gcm-v1";
const name=(scope:string)=>"namuh-token-"+scope;
function host(op:"encrypt"|"decrypt",scope:string,input:Buffer):Buffer{
 const args=["--user","--name="+name(scope),...(op==="encrypt"?["--with-key=host"]:[]),op,"-","-"];
 const r=spawnSync("/usr/bin/systemd-creds",args,{input,timeout:10000,maxBuffer:65536});
 if(r.error||r.status!==0||!r.stdout?.length)throw new Error("NH_HOST_CACHE_CRYPTO_FAILED");
 return r.stdout;
}
function key(secret:string,scope:string,salt:Buffer){
 if(!secret)throw new Error("NH_CACHE_KEY_MISSING");
 return Buffer.from(hkdfSync("sha256",secret,salt,"namuh-token-cache-v2:"+scope,32));
}
export function seal(value:object,secret:string,scope:string,mode:Protection){
 const plain=Buffer.from(JSON.stringify(value));
 if(mode==="systemd-host-v1")return {v:2,scheme:mode,blob:host("encrypt",scope,plain).toString("base64")};
 const salt=randomBytes(16),iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key(secret,scope,salt),iv);
 cipher.setAAD(Buffer.from(scope));
 const blob=Buffer.concat([cipher.update(plain),cipher.final()]);
 return {v:2,scheme:mode,salt:salt.toString("base64"),iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),blob:blob.toString("base64")};
}
export function unseal(obj:any,secret:string,scope:string,mode:Protection):{value:any;scheme:string}{
 try{
  if(obj?.v===undefined&&typeof obj?.token==="string")return {value:obj,scheme:"legacy-plaintext"};
  if(obj?.v!==2||typeof obj.blob!=="string")throw Error();
  if(obj.scheme==="systemd-host-v1"){
   if(mode!==obj.scheme)throw Error();
   return {value:JSON.parse(host("decrypt",scope,Buffer.from(obj.blob,"base64")).toString()),scheme:obj.scheme};
  }
  if(obj.scheme!=="aes-gcm-v1")throw Error();
  const decipher=createDecipheriv("aes-256-gcm",key(secret,scope,Buffer.from(obj.salt,"base64")),Buffer.from(obj.iv,"base64"));
  decipher.setAAD(Buffer.from(scope));decipher.setAuthTag(Buffer.from(obj.tag,"base64"));
  return {value:JSON.parse(Buffer.concat([decipher.update(Buffer.from(obj.blob,"base64")),decipher.final()]).toString()),scheme:obj.scheme};
 }catch{throw new Error("NH_CACHE_DECRYPT_FAILED");}
}

import {request,Agent} from "node:https";
import {connect as unixConnect} from "node:net";
import {connect as tlsConnect} from "node:tls";
import {lstatSync} from "node:fs";
import {dirname} from "node:path";
const ORIGIN="https://api.nhplug.com:8443";
const LIMIT=3_000_000;
export async function brokerFetch(input:string|URL,init:RequestInit):Promise<Response>{
 const path=process.env.NH_BROKER_RELAY_SOCKET;
 if(path===undefined)return fetch(input,init); // current deployment; explicitly configured relay never falls back
 if(!path)throw Error("NH_RELAY_SOCKET_MISSING");
 return relayFetch(input,init,path);
}
export async function relayFetch(input:string|URL,init:RequestInit,path:string):Promise<Response>{
 const u=new URL(input);
 if(u.origin!==ORIGIN||u.username||u.password||u.hash)throw Error("NH_RELAY_DESTINATION_DENIED");
 const st=lstatSync(path),parent=lstatSync(dirname(path));
 if(!st.isSocket()||st.uid!==process.getuid?.()||st.mode&0o077||!parent.isDirectory()||parent.uid!==process.getuid?.()||parent.mode&0o077)
  throw Error("NH_RELAY_SOCKET_INVALID");
 if(init.redirect!=="manual"||!["POST","GET","HEAD"].includes(init.method??"GET"))throw Error("NH_RELAY_REQUEST_INVALID");
 if(init.body!=null&&typeof init.body!=="string")throw Error("NH_RELAY_BODY_INVALID");
 const agent=new Agent({keepAlive:false});
 agent.createConnection=()=>tlsConnect({socket:unixConnect(path),servername:u.hostname,rejectUnauthorized:true});
 try{
  return await new Promise<Response>((resolve,reject)=>{
   const headers=Object.fromEntries(new Headers(init.headers).entries());
   if(typeof init.body==="string")headers["content-length"]=String(Buffer.byteLength(init.body));
   const req=request(u,{method:init.method,headers,agent,signal:init.signal??AbortSignal.timeout(15000)},res=>{
    const chunks:Buffer[]=[];let total=0;
    res.on("data",(chunk:Buffer)=>{total+=chunk.length;if(total>LIMIT){req.destroy(Error("NH_RELAY_RESPONSE_LIMIT"));return;}chunks.push(chunk);});
    res.on("error",()=>reject(Error("NH_RELAY_RESPONSE_FAILED")));
    res.on("end",()=>{try{
     const status=res.statusCode??500;
     const h=new Headers();for(const [k,v] of Object.entries(res.headers))if(v!==undefined)h.set(k,Array.isArray(v)?v.join(", "):v);
     resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers:h}));
    }catch{reject(Error("NH_RELAY_RESPONSE_FAILED"));}});
   });
   req.on("error",()=>reject(Error("NH_RELAY_REQUEST_FAILED")));
   req.end(init.body??undefined);
  });
 }finally{agent.destroy();}
}

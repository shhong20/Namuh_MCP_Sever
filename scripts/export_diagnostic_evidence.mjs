import {execFileSync} from "node:child_process";
import {mkdirSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync} from "node:fs";
import {join} from "node:path";
import {homedir} from "node:os";
import {randomBytes} from "node:crypto";
import {SERVICE_UNITS,eventOf,parseJournalText} from "../dist/capture-ops.js";
import {readUnitStatuses} from "../dist/capture-invocations.js";
import {parseBootWindows} from "../dist/capture-schedule-coverage.js";
const units=new Set(Object.values(SERVICE_UNITS));
const id=v=>typeof v==="string"&&/^[a-f0-9]{32}$/.test(v)?v:undefined;
const results=new Set(["done","failed","dependency","timeout","canceled","skipped"]);
export function sanitizeRow(r){
 const ts=String(r.__REALTIME_TIMESTAMP??"");
 if(!/^\d{1,18}$/.test(ts))return null;
 const common={__REALTIME_TIMESTAMP:ts,_BOOT_ID:id(r._BOOT_ID)};
 if(r.SYSLOG_IDENTIFIER==="systemd"&&r.JOB_TYPE==="start"&&units.has(r.USER_UNIT)&&id(r.USER_INVOCATION_ID)){
  if(r.JOB_RESULT&&!results.has(r.JOB_RESULT))return null;
  return {...common,SYSLOG_IDENTIFIER:"systemd",JOB_TYPE:"start",USER_UNIT:r.USER_UNIT,USER_INVOCATION_ID:id(r.USER_INVOCATION_ID),JOB_RESULT:r.JOB_RESULT||undefined};
 }
 const ev=eventOf(r);
 if(!ev)return null;
 return {...common,SYSLOG_IDENTIFIER:"node",_SYSTEMD_USER_UNIT:r._SYSTEMD_USER_UNIT,_SYSTEMD_INVOCATION_ID:id(r._SYSTEMD_INVOCATION_ID),
 MESSAGE:JSON.stringify({decision:ev.decision,date:ev.date,duration_ms:ev.duration_ms,source_pages:ev.source_pages,broker_calls:ev.broker_calls,failure_kind:ev.failure_kind,created:ev.created,findings:ev.findings,capture_gap_minutes:ev.capture_gap_minutes,pair_verified:ev.pair_verified})};
}
export function collect(){
 const env={...process.env,LC_ALL:"C",TZ:"Asia/Seoul",XDG_RUNTIME_DIR:process.env.XDG_RUNTIME_DIR||"/run/user/1000",DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS||"unix:path=/run/user/1000/bus"};
 const raw=execFileSync("/usr/bin/journalctl",["--user","--no-pager","-o","json","--since","90 days ago","-n","10001",...Array.from(units).flatMap(u=>["-u",u])],{encoding:"utf8",timeout:10000,maxBuffer:8*1024*1024,env});
 if(raw.trim().split("\n").length>10000)throw Error("Journal evidence exceeds bound");
 const rows=parseJournalText(raw,10002).map(sanitizeRow).filter(Boolean);
 const boots=parseBootWindows(JSON.parse(execFileSync("/usr/bin/journalctl",["--list-boots","--no-pager","-o","json"],{encoding:"utf8",timeout:10000,maxBuffer:1024*1024,env}))).filter(b=>id(b.boot_id));
 const statuses=readUnitStatuses();
 for(const s of Object.values(statuses)){
  if(!s)continue;
  if(!["success","exit-code","signal","timeout","core-dump","watchdog","resources","protocol","start-limit-hit","oom-kill","skip-condition"].includes(s.result))s.result=null;
  s.invocation_id=id(s.invocation_id)??null;
 }
 return {version:1,generated_utc:new Date().toISOString(),rows,boots,statuses};
}
export function save(data,root){
 mkdirSync(root,{mode:0o700,recursive:true});
 const st=lstatSync(root);
 if(!st.isDirectory()||st.uid!==process.getuid()||st.mode&0o077)throw Error("Unsafe evidence directory");
 const tmp=join(root,".evidence-"+randomBytes(8).toString("hex"));
 let fd;
 try{fd=openSync(tmp,"wx",0o600);writeFileSync(fd,JSON.stringify(data));fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(tmp,join(root,"evidence.json"));}
 finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(tmp)}catch{}}
}
if(import.meta.url===new URL("file:"+process.argv[1]).href){
 try{const data=collect();save(data,join(homedir(),".local/state/namuh-diagnostic-evidence"));console.log(JSON.stringify({decision:"NH_DIAGNOSTIC_EVIDENCE_OK",rows:data.rows.length,boots:data.boots.length}));}
 catch{console.error("NH_DIAGNOSTIC_EXPORT_FAILED");process.exitCode=1;}
}

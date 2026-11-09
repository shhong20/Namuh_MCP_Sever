import {execFileSync} from "node:child_process";
import {SERVICE_UNITS,eventOf,parseJournalText} from "./capture-ops.js";

type Service=keyof typeof SERVICE_UNITS;
type JournalRow={
 _BOOT_ID?:string;USER_UNIT?:string;_SYSTEMD_USER_UNIT?:string;
 USER_INVOCATION_ID?:string;_SYSTEMD_INVOCATION_ID?:string;
 JOB_TYPE?:string;JOB_RESULT?:string;SYSLOG_IDENTIFIER?:string;
 MESSAGE?:string;__REALTIME_TIMESTAMP?:string;
};
type UnitStatus={result:string|null;exit_code:number|null;invocation_id:string|null;
 timer_last_trigger_utc:string|null;timer_active:boolean|null};
const serviceNames=Object.entries(SERVICE_UNITS) as [Service,string][];
const microsToIso=(v:unknown)=>{
 const n=Number(v);
 return Number.isFinite(n)&&n>0?new Date(n/1000).toISOString():null;
};
const safeResults=new Set(["done","failed","dependency","timeout","canceled","skipped"]);
const safeOutcomes=new Set(["SNAPSHOT_OK","SNAPSHOT_FAILED","NAV_CANDIDATE_OK",
 "NAV_CANDIDATE_FAILED","PENDING_VALIDATION_WINDOW",
 "CAPTURE_INTEGRITY_REVIEW_REQUIRED","CAPTURED_ACCOUNTING_REVIEW_REQUIRED",
 "CAPTURED_SOURCE_CHECK_PASS","CAPTURE_VALIDATION_FAILED"]);
export function correlateSystemdInvocations(rows:JournalRow[],statuses:Partial<Record<Service,UnitStatus>>={}){
 const records=new Map<string,{
  service:Service;invocation_id:string;boot_id:string;start_utc:string|null;
  terminal_utc:string|null;job_result:string|null;
  outcome:string|null;outcome_utc:string|null;
 }>();
 for(const row of rows){
  const resultService=serviceNames.find(([,unit])=>unit===row._SYSTEMD_USER_UNIT)?.[0];
  const managerService=serviceNames.find(([,unit])=>unit===row.USER_UNIT)?.[0];
  const systemdManager=row.SYSLOG_IDENTIFIER==="systemd"&&row.JOB_TYPE==="start";
  const id=systemdManager?row.USER_INVOCATION_ID:row._SYSTEMD_INVOCATION_ID;
  const service=systemdManager?managerService:resultService;
  if(!service||!id||!/^([a-f0-9]{32})$/.test(id))continue;
  const boot=row._BOOT_ID;
  if(!boot)continue;
  const key=[service,boot,id].join("|");
  const rec=records.get(key)??{
   service,invocation_id:id,boot_id:boot,start_utc:null,terminal_utc:null,
   job_result:null,outcome:null,outcome_utc:null
  };
  const stamp=microsToIso(row.__REALTIME_TIMESTAMP);
  if(systemdManager){
   if(row.JOB_RESULT&&safeResults.has(row.JOB_RESULT)){
    rec.terminal_utc=stamp;rec.job_result=row.JOB_RESULT;
   }else if(!row.JOB_RESULT)rec.start_utc=stamp;
  } else {
   // Only the allowlisted result payload is read, not raw journal messages or account details.
   const evt=eventOf(row);
   if(evt&&safeOutcomes.has(evt.decision)){
    rec.outcome=evt.decision;rec.outcome_utc=stamp;
   }
  }
  records.set(key,rec);
 }
 const runs=[...records.values()].sort((a,b)=>(a.start_utc??a.outcome_utc??"").localeCompare(b.start_utc??b.outcome_utc??""));
 const publicRuns=runs.map(r=>{
  const active=statuses[r.service];
  const current=active?.invocation_id===r.invocation_id;
  return {service:r.service,boot_id:r.boot_id,invocation_id_hash_hint:r.invocation_id.slice(0,8),
   start_utc:r.start_utc,terminal_utc:r.terminal_utc,
   service_manager_job_result:r.job_result,
   application_outcome:r.outcome,
   latest_unit_exit_code:current?active?.exit_code??null:null,
   latest_unit_exit_code_correlated:!!current&&active?.exit_code!==null&&active?.exit_code!==undefined,
   invocation_classification:r.job_result&&r.outcome?
    "MANAGER_AND_APPLICATION_RESULT_MATCHED":
     r.job_result&&!r.outcome?"SYSTEMD_RESULT_NO_APPLICATION_EVENT":
     !r.job_result&&r.outcome?"APPLICATION_EVENT_NO_SYSTEMD_RESULT":
     "INCOMPLETE_INVOCATION_EVIDENCE",
   timer_activation_proven:false};
 });
 const counts:Record<string,number>={};
 for(const r of publicRuns)counts[r.invocation_classification]=(counts[r.invocation_classification]??0)+1;
 const latestState=Object.fromEntries(serviceNames.map(([s])=>{
  const st=statuses[s];
  return [s,{
   unit_result:st?.result??null,
   latest_exit_code:st?.exit_code??null,
   current_invocation_id_known:!!st?.invocation_id,
   timer_last_trigger_utc:st?.timer_last_trigger_utc??null,
   timer_active:st?.timer_active??null,
   last_exit_code_is_only_latest_unit_state:true
  }];
 }));
 return {invocation_count:publicRuns.length,matching_counts:counts,
  invocations:publicRuns,latest_unit_states:latestState,
  confirmed_timer_triggered_invocations:0,
  schedule_success_rate:null,
  note:"systemd의 USER_INVOCATION_ID와 앱 로그의 _SYSTEMD_INVOCATION_ID를 같은 부팅 ID에서 일치시킨 결과입니다. 서비스 완료 로그·앱 종료 이벤트는 결합했지만 실행 원인이 타이머인지 수동 start인지 구별할 기록은 없을 수 있습니다. 현재 systemctl 종료코드는 같은 InvocationID가 명확히 일치할 때만 연결합니다.",
  no_broker_requests:true,no_mutations:true};
}
function showFields(unit:string):Record<string,string>{
 const env={...process.env,XDG_RUNTIME_DIR:process.env.XDG_RUNTIME_DIR||"/run/user/1000",
 DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS||"unix:path=/run/user/1000/bus"};
 const out=execFileSync("systemctl",["--user","show",unit,
 "-p","Result","-p","ExecMainStatus","-p","InvocationID",
 "-p","LastTriggerUSec","-p","ActiveState"],
 {encoding:"utf8",timeout:10000,maxBuffer:32000,env});
 return Object.fromEntries(out.split("\n").filter(x=>x.includes("=")).map(x=>x.split(/=(.*)/s).slice(0,2)));
}
function parseTime(raw:string|undefined){
 if(!raw||raw==="n/a")return null;
 const m=raw.match(/^[A-Za-z]{3} (\\d{4})-(\\d{2})-(\\d{2}) (\\d{2}):(\\d{2}):(\\d{2}) KST$/);
 if(!m)return null;
 const d=new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`);
 return Number.isFinite(d.getTime())?d.toISOString():null;
}
export function captureInvocationReport(days=30){
 if(!Number.isInteger(days)||days<1||days>90)throw Error("조회일 범위는 1~90입니다.");
 const env={...process.env,XDG_RUNTIME_DIR:process.env.XDG_RUNTIME_DIR||"/run/user/1000",
 DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS||"unix:path=/run/user/1000/bus"};
 const stdout=execFileSync("journalctl",["--user","--no-pager","-o","json",
 "--since",`${days} days ago`,...Object.values(SERVICE_UNITS).flatMap(x=>["-u",x])],
 {encoding:"utf8",timeout:10000,maxBuffer:4*1024*1024,env});
 const statuses:Partial<Record<Service,UnitStatus>>={};
 for(const [service,unit] of serviceNames){
  const s=showFields(unit),t=showFields(unit.replace(".service",".timer"));
  const n=Number(s.ExecMainStatus);
  statuses[service]={result:s.Result??null,exit_code:s.ExecMainStatus!==""&&Number.isInteger(n)?n:null,
   invocation_id:s.InvocationID||null,timer_last_trigger_utc:parseTime(t.LastTriggerUSec),
   timer_active:t.ActiveState? t.ActiveState==="active":null};
 }
 return {...correlateSystemdInvocations(parseJournalText(stdout),statuses),lookback_days:days};
}

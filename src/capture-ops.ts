import {execFileSync} from "node:child_process";

export const SERVICE_UNITS={
  holdings:"namuh-portfolio-snapshot.service",
  nav:"namuh-nav-candidate.service",
  validation:"namuh-capture-validation.service"
} as const;
type Service=keyof typeof SERVICE_UNITS;
type Decision="SNAPSHOT_OK"|"SNAPSHOT_FAILED"|"NAV_CANDIDATE_OK"|"NAV_CANDIDATE_FAILED"|
 "PENDING_VALIDATION_WINDOW"|"CAPTURE_INTEGRITY_REVIEW_REQUIRED"|
 "CAPTURED_ACCOUNTING_REVIEW_REQUIRED"|"CAPTURED_SOURCE_CHECK_PASS"|"CAPTURE_VALIDATION_FAILED";
const allowed=new Set<string>([
 "SNAPSHOT_OK","SNAPSHOT_FAILED","NAV_CANDIDATE_OK","NAV_CANDIDATE_FAILED",
 "PENDING_VALIDATION_WINDOW","CAPTURE_INTEGRITY_REVIEW_REQUIRED",
 "CAPTURED_ACCOUNTING_REVIEW_REQUIRED","CAPTURED_SOURCE_CHECK_PASS","CAPTURE_VALIDATION_FAILED"]);
const units=new Map<string,Service>(Object.entries(SERVICE_UNITS).map(([k,v])=>[v,k as Service]));
const safeKinds=new Set([
 "AUTH_REQUIRES_REVIEW","BROKER_RATE_LIMIT","NETWORK_UNAVAILABLE","BROKER_HTTP_FAILURE",
 "SOURCE_PAGINATION_INCOMPLETE","BROKER_BUSINESS_RESPONSE_UNEXPECTED",
 "STORAGE_PERMISSION_OR_INTEGRITY","UNKNOWN_FAILURE"]);
type Entry={_SYSTEMD_USER_UNIT?:string;USER_UNIT?:string;_SYSTEMD_INVOCATION_ID?:string;
 USER_INVOCATION_ID?:string;__REALTIME_TIMESTAMP?:string;MESSAGE?:string;SYSLOG_IDENTIFIER?:string;JOB_RESULT?:string};
type Event={service:Service;decision:Decision;date:string|null;timestamp:string|null;
 duration_ms:number|null;source_pages:number|null;broker_calls:number|null;
 failure_kind:string|null;created:boolean|null};
function positiveDuration(v:unknown):number|null{
 return typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=3600000?Math.round(v):null;
}
function nonnegativeInt(v:unknown):number|null{
 return typeof v==="number"&&Number.isInteger(v)&&v>=0&&v<1000?v:null;
}
function eventOf(raw:Entry):Event|null{
 const service=units.get(raw._SYSTEMD_USER_UNIT??"");
 if(!service||raw.SYSLOG_IDENTIFIER!=="node"||typeof raw.MESSAGE!=="string"||!raw.MESSAGE.startsWith("{"))return null;
 let d:Record<string,unknown>;
 try{d=JSON.parse(raw.MESSAGE);}catch{return null;}
 if(!d||typeof d!=="object"||!allowed.has(String(d.decision??"")))return null;
 const decision=d.decision as Decision;
 if(service==="holdings"&&!["SNAPSHOT_OK","SNAPSHOT_FAILED"].includes(decision))return null;
 if(service==="nav"&&!["NAV_CANDIDATE_OK","NAV_CANDIDATE_FAILED"].includes(decision))return null;
 if(service==="validation"&&["SNAPSHOT_OK","SNAPSHOT_FAILED","NAV_CANDIDATE_OK","NAV_CANDIDATE_FAILED"].includes(decision))return null;
 const micros=Number(raw.__REALTIME_TIMESTAMP);
 const timestamp=Number.isFinite(micros)&&micros>0?new Date(micros/1000).toISOString():null;
 const date=typeof d.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)?d.date:null;
 return {service,decision,date,timestamp,
  duration_ms:positiveDuration(d.duration_ms),
  source_pages:nonnegativeInt(d.source_pages),
  broker_calls:nonnegativeInt(d.broker_calls),
  failure_kind:typeof d.failure_kind==="string"&&safeKinds.has(d.failure_kind)?d.failure_kind:null,
  created:typeof d.created==="boolean"?d.created:null};
}
function pct(n:number,d:number):number|null{return d?Math.round(n*10000/d)/100:null;}
export function summarizeCaptureOperations(raw:Entry[],retentionDays=30){
 const events=raw.map(eventOf).filter((x):x is Event=>x!==null).sort((a,b)=>(a.timestamp??"").localeCompare(b.timestamp??""));
 const byService=Object.fromEntries((Object.keys(SERVICE_UNITS) as Service[]).map(service=>{
  const ev=events.filter(e=>e.service===service);
  const success=ev.filter(e=>["SNAPSHOT_OK","NAV_CANDIDATE_OK",
    "PENDING_VALIDATION_WINDOW","CAPTURED_ACCOUNTING_REVIEW_REQUIRED","CAPTURED_SOURCE_CHECK_PASS"].includes(e.decision));
  const failures=ev.filter(e=>["SNAPSHOT_FAILED","NAV_CANDIDATE_FAILED",
    "CAPTURE_INTEGRITY_REVIEW_REQUIRED","CAPTURE_VALIDATION_FAILED"].includes(e.decision));
  const durations=ev.map(e=>e.duration_ms).filter((x):x is number=>x!==null).sort((a,b)=>a-b);
  const pageCounts=ev.map(e=>e.source_pages).filter((x):x is number=>x!==null);
  const brokerCallCounts=ev.map(e=>e.broker_calls).filter((x):x is number=>x!==null);
  const errors:Record<string,number>={};
  for(const e of failures){
   const key=e.failure_kind??e.decision;
   errors[key]=(errors[key]??0)+1;
  }
  return [service,{
   observed_invocations:ev.length,
   observed_successes:success.length,
   observed_failures:failures.length,
   observed_success_pct:pct(success.length,ev.length),
   new_files_created:ev.filter(e=>e.created===true).length,
   already_existing_noop:ev.filter(e=>e.created===false).length,
   outcome_unknown:ev.length-success.length-failures.length,
   measured_durations:durations.length,
   latency_ms:{min:durations.at(0)??null,p50:durations.length?durations[Math.ceil(durations.length*.5)-1]:null,
    p95:durations.length?durations[Math.ceil(durations.length*.95)-1]:null,
    max:durations.at(-1)??null},
   observed_source_pages:{samples:pageCounts.length,total:pageCounts.length?pageCounts.reduce((a,b)=>a+b,0):null},
   observed_broker_calls:{samples:brokerCallCounts.length,total:brokerCallCounts.length?brokerCallCounts.reduce((a,b)=>a+b,0):null},
   errors,latest_event:ev.at(-1)??null
  }];
 }));
 return {lookback_days:retentionDays,records_observed:events.length,
  services:byService,
  report_scope:"OBSERVED_JOURNAL_EVENTS_ONLY",
  full_schedule_coverage_verified:false,
  performance_returns_available:false,
  warnings:[
   "성공률은 확인된 실행 로그에서만 계산합니다. WSL 중단/저널 삭제/로그 수집 누락까지 포함한 일정 대비 성공률은 아닙니다.",
   "기존 로그에는 duration_ms, source_pages, broker_calls가 없을 수 있으며 결측값은 추정하지 않습니다.",
   "업무 응답이 정상이어도 NH 순자산 산식이나 투자수익률의 검증을 의미하지 않습니다.",
   "성공 로그가 없는 systemd 실행은 관측에서 제외될 수 있으므로 별도 타이머/파일 무결성 게이트와 함께 보세요."
  ]};
}
export function parseJournalText(stdout:string,limit=10000):Entry[]{
 const lines=stdout.split("\n");
 const parsed:Entry[]=[];
 for(const line of lines.slice(-limit)){
  if(!line.startsWith("{"))continue;
  try{
   const obj=JSON.parse(line);
   if(obj&&typeof obj==="object")parsed.push(obj as Entry);
  }catch{}
 }
 return parsed;
}
export function captureOpsReport(days=30){
 if(!Number.isInteger(days)||days<1||days>90)throw new Error("조회일 범위는 1~90입니다.");
 const args=["--user","--no-pager","-o","json","--since",`${days} days ago`,
   ...Object.values(SERVICE_UNITS).flatMap(u=>["-u",u])];
 const env={...process.env,
   XDG_RUNTIME_DIR:process.env.XDG_RUNTIME_DIR||"/run/user/1000",
   DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS||"unix:path=/run/user/1000/bus"};
 const stdout=execFileSync("journalctl",args,{encoding:"utf8",timeout:10000,maxBuffer:3*1024*1024,env});
 return summarizeCaptureOperations(parseJournalText(stdout),days);
}

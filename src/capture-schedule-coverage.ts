import {execFileSync} from "node:child_process";
import {SERVICE_UNITS,eventOf,parseJournalText,type Event} from "./capture-ops.js";

type Service=keyof typeof SERVICE_UNITS;
type BootWindow={boot_id:string;start_ms:number;end_ms:number};
const times:Record<Service,string>={holdings:"20:30",nav:"20:40",validation:"20:55"};
const pad=(n:number)=>String(n).padStart(2,"0");
const localDate=(utcMs:number)=>new Intl.DateTimeFormat("en-CA",
 {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(utcMs));
function localTime(date:string,hhmm:string):number{
 const value=Date.parse(date+"T"+hhmm+":00+09:00");
 if(!Number.isFinite(value))throw Error("날짜 또는 예약시각 형식 오류");
 return value;
}
function nextDay(date:string):string{
 const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);
}
export function parseBootWindows(raw:unknown):BootWindow[]{
 if(!Array.isArray(raw))throw Error("부팅 구간 JSON 오류");
 return raw.flatMap(x=>{
  const start=Number(x?.first_entry),end=Number(x?.last_entry);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||start<0)return [];
  return [{boot_id:String(x.boot_id??"unknown"),start_ms:start/1000,end_ms:end/1000}];
 });
}
const isSuccess=(event:Event)=>["SNAPSHOT_OK","NAV_CANDIDATE_OK",
 "PENDING_VALIDATION_WINDOW","CAPTURED_ACCOUNTING_REVIEW_REQUIRED",
 "CAPTURED_SOURCE_CHECK_PASS"].includes(event.decision);
const isFailure=(event:Event)=>["SNAPSHOT_FAILED","NAV_CANDIDATE_FAILED",
 "CAPTURE_INTEGRITY_REVIEW_REQUIRED","CAPTURE_VALIDATION_FAILED"].includes(event.decision);
export function evaluateScheduleCoverage(rawEvents:Event[],boots:BootWindow[],
 now=new Date(),days=30){
 if(!Number.isInteger(days)||days<1||days>90)throw Error("조회일 범위는 1~90입니다");
 if(!Number.isFinite(now.getTime()))throw Error("유효하지 않은 관측시각");
 const nowMs=now.getTime();
 const floorMs=nowMs-days*86400000;
 const today=localDate(nowMs);
 const services=Object.fromEntries((Object.keys(SERVICE_UNITS) as Service[]).map(service=>{
  const observed=rawEvents.filter(x=>x.service===service&&x.timestamp&&Number.isFinite(Date.parse(x.timestamp)))
   .sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
  const baseline=observed.find(x=>Date.parse(x.timestamp!)>=floorMs);
  const startDate=baseline?localDate(Date.parse(baseline.timestamp!)):null;
  const slots=[] as Array<{date:string;scheduled_kst:string;state:string;observed_outcomes:number;
   on_day_successes:number;on_day_failures:number;wsl_boot_window_evidence:boolean;
   scheduled_timer_invocation_proven:false}>;
  if(startDate){
   let date=startDate;
   while(date<=today&&slots.length<=days+2){
    const scheduled=localTime(date,times[service]);
    if(scheduled>nowMs){date=nextDay(date);continue;}
    const after=observed.filter(e=>{
     if(!e.timestamp)return false;
     const ts=Date.parse(e.timestamp);
     // A manually run job can produce a result on the same date; label only observation.
     return localDate(ts)===date&&ts>=scheduled;
    });
    const successes=after.filter(isSuccess).length;
    const failures=after.filter(isFailure).length;
    const currentBoots=boots.some(b=>b.start_ms<=scheduled&&
      (b.end_ms>=scheduled||b.end_ms>=nowMs-120000&&localDate(nowMs)===date));
    let state:string;
    if(failures)state="OBSERVED_FAILURE_ON_DATE";
    else if(successes)state="OBSERVED_SUCCESS_ON_DATE";
    else if(currentBoots)state="NO_RESULT_WITH_WSL_RUNTIME_EVIDENCE";
    else state="NO_RESULT_RUNTIME_UNCONFIRMED";
    slots.push({date,scheduled_kst:times[service],state,
     observed_outcomes:after.length,on_day_successes:successes,on_day_failures:failures,
     wsl_boot_window_evidence:currentBoots,scheduled_timer_invocation_proven:false});
    date=nextDay(date);
   }
  }
  const withOutcomes=slots.filter(s=>s.on_day_successes+s.on_day_failures>0).length;
  const succeeded=slots.filter(s=>s.state==="OBSERVED_SUCCESS_ON_DATE").length;
  const failed=slots.filter(s=>s.state==="OBSERVED_FAILURE_ON_DATE").length;
  return [service,{baseline_date:startDate,scheduled_hhmm_kst:times[service],
    due_slots_since_first_observed_event:slots.length,
    days_with_observed_result:withOutcomes,
    observed_success_days:succeeded,observed_failure_days:failed,
    no_result_with_runtime_evidence:slots.filter(s=>s.state==="NO_RESULT_WITH_WSL_RUNTIME_EVIDENCE").length,
    no_result_runtime_unconfirmed:slots.filter(s=>s.state==="NO_RESULT_RUNTIME_UNCONFIRMED").length,
    observed_result_coverage_pct:slots.length?Math.round(withOutcomes*10000/slots.length)/100:null,
    scheduled_activation_proven:false,
    slots}];
 }));
 return {lookback_days:days,as_of_utc:now.toISOString(),
  metric_scope:"POST_BASELINE_SCHEDULED_SLOTS_VS_OBSERVED_RESULTS",
  services,
  full_schedule_success_rate:null,
  wsl_downtime_confirmed:false,
  trading_enabled:false,
  return_calculation_available:false,
  warnings:[
   "최초 관측 전 타이머가 설치되어 있었는지 확인할 수 없어 그 이전 예약 횟수는 분모에서 제외합니다.",
   "로그에 기록된 실행은 수동 실행 또는 Persistent 재실행일 수 있습니다. 타이머가 정확히 발동했다는 증거는 아닙니다.",
   "WSL 부팅 구간에 실행 근거가 없어도 WSL 중단으로 확정하지 않으며, 반대로 부팅 구간 관측만으로 user timer 실행을 보증하지 않습니다.",
   "당일 예약 시각 이전은 분모에서 제외합니다. 기간 초반/저널 회전·부팅 범위 부재는 미확인으로 남깁니다.",
   "실패 결과가 있는 날짜에 재실행 성공 결과가 있어도 원인 조사를 위해 실패로 분류합니다. 증권사 API 자동 재시도는 하지 않습니다."
  ]};
}
function readSystemdJournal(days:number):string{
 const args=["--user","--no-pager","-o","json","--since",`${days} days ago`,
  ...Object.values(SERVICE_UNITS).flatMap(u=>["-u",u])];
 const env={...process.env,
  XDG_RUNTIME_DIR:process.env.XDG_RUNTIME_DIR||"/run/user/1000",
  DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS||"unix:path=/run/user/1000/bus"};
 return execFileSync("journalctl",args,{encoding:"utf8",timeout:10000,maxBuffer:4*1024*1024,env});
}
export function scheduleCoverageReport(days=30){
 if(!Number.isInteger(days)||days<1||days>90)throw Error("조회일 범위는 1~90입니다");
 const events=parseJournalText(readSystemdJournal(days)).map(eventOf).filter((x):x is Event=>x!==null);
 const bootRaw=execFileSync("journalctl",["--list-boots","--no-pager","-o","json"],
  {encoding:"utf8",timeout:10000,maxBuffer:1024*1024});
 return evaluateScheduleCoverage(events,parseBootWindows(JSON.parse(bootRaw)),new Date(),days);
}

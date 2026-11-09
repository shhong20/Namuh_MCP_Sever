import {listSnapshots,currentSeoulDate} from "./history.js";
import {listNavCandidates} from "./nav-candidate.js";

type RecordDate={date:string;captured_at:string;holdings_value_krw?:number;reported_net_assets_krw?:number};
type Dataset={
  name:"securities_only"|"broker_nav_candidate";
  scheduled_hhmm:"20:30"|"20:40";
  count:number;
  last_recorded_date:string|null;
  current_date_present:boolean;
  status:"PENDING_SCHEDULE"|"DUE_BUT_MISSING"|"TODAY_CAPTURED"|"NO_RECORDS"|"CLOCK_UNKNOWN";
  observed_dates:string[];
  recent_calendar_gaps:string[];
};
function seoulClock(now:Date):{date:string;hhmm:string}|null {
  if(!Number.isFinite(now.getTime()))return null;
  const fmt=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Seoul",hour12:false,
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  const v=Object.fromEntries(fmt.formatToParts(now).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return {date:[v.year,v.month,v.day].join("-"),hhmm:v.hour+":"+v.minute};
}
function plusDay(date:string):string {
 const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);
}
function dataset(name:Dataset["name"],schedule:Dataset["scheduled_hhmm"],records:RecordDate[],now:{date:string;hhmm:string}|null):Dataset {
 const dates=[...new Set(records.map(r=>r.date))].sort();
 const today=!!now&&dates.includes(now.date);
 const gaps:string[]=[];
 for(let i=1;i<dates.length;i++){
   if(plusDay(dates[i-1])!==dates[i])gaps.push(dates[i-1]+" → "+dates[i]);
 }
 let status:Dataset["status"];
 if(!now)status="CLOCK_UNKNOWN";
 else if(today)status="TODAY_CAPTURED";
 else if(now.hhmm<schedule)status="PENDING_SCHEDULE";
 else if(!dates.length)status="NO_RECORDS";
 else status="DUE_BUT_MISSING";
 return {name,scheduled_hhmm:schedule,count:records.length,
   last_recorded_date:dates.at(-1)??null,current_date_present:today,
   status,observed_dates:dates,recent_calendar_gaps:gaps.slice(-10)};
}
export function inspectCaptureState(
 holdings:RecordDate[],nav:RecordDate[],now=new Date()
){
 const clock=seoulClock(now);
 const stocks=dataset("securities_only","20:30",holdings,clock);
 const candidates=dataset("broker_nav_candidate","20:40",nav,clock);
 const sameDates=stocks.observed_dates.filter(d=>candidates.observed_dates.includes(d));
 const pairs=sameDates.map(date=>{
   const h=holdings.find(x=>x.date===date),n=nav.find(x=>x.date===date);
   const holdingsAt=Date.parse(h?.captured_at??""),navAt=Date.parse(n?.captured_at??"");
   const validTimes=Number.isFinite(holdingsAt)&&Number.isFinite(navAt);
   const holdingValue=h?.holdings_value_krw;
   const navValue=n?.reported_net_assets_krw;
   return {date,holdings_capture_utc:validTimes?h?.captured_at:null,
     nav_capture_utc:validTimes?n?.captured_at:null,
     capture_gap_minutes:validTimes?Math.round(Math.abs(navAt-holdingsAt)/60000):null,
     holdings_only_value_krw:Number.isFinite(holdingValue)?holdingValue:null,
     broker_nav_candidate_krw:Number.isFinite(navValue)?navValue:null,
     same_timestamp:false,
     direct_return_comparison_allowed:false,
     note:"동일 날짜에 수집했어도 평가 기준과 시각이 다르므로 잔고 차이를 현금 잔액이나 투자수익률로 해석하지 않습니다."};
 });
 const holdingsOnly=stocks.observed_dates.filter(d=>!candidates.observed_dates.includes(d));
 const navOnly=candidates.observed_dates.filter(d=>!stocks.observed_dates.includes(d));
 return {
   observed_at_utc:Number.isFinite(now.getTime())?now.toISOString():null,
   seoul_today:clock?.date??null,
   seoul_clock:clock?.hhmm??null,
   datasets:{holdings:stocks,nav_candidates:candidates},
   same_day_pairs:sameDates,
   paired_observations:pairs,
   mismatched_record_dates:{holdings_only:holdingsOnly,nav_only:navOnly},
   same_date_comparison_available:sameDates.length>0,
   verified_account_nav:false,
   investment_return_available:false,
   repair_policy:{
     same_day_capture:"기존 파일이 없다면 별도 승인된 조회로 오늘 날짜만 수집 가능; 기존 파일은 덮어쓰지 않음",
     historic_gaps:"과거 시점의 평가원본이 없으므로 현재 API 값으로 소급 채우지 않음",
     retries:"실패 때 자동 무한 재시도하지 않음. 사용자 인증·호출 한도 확인 후 안전한 재실행",
     comparison:"서로 같은 날짜라도 평가시각 차이가 있으므로 금액을 직접 차감해 투자수익률을 계산하지 않음"
   },
   note:"날짜별 파일 존재를 진단합니다. 타이머의 실제 실행 상태나 실패 원인은 systemd journal과 별도 대조해야 하며, 당일 예약 시각 이전에 파일이 없다는 이유로 실패라고 판단하지 않습니다."
 };
}
export async function captureIntegrityReport(){
 const [h,n]=await Promise.all([listSnapshots(),listNavCandidates()]);
 return inspectCaptureState(h,n);
}

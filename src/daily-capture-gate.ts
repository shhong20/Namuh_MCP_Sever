import {inspectCaptureState} from "./capture-integrity.js";
import {listNavCandidates} from "./nav-candidate.js";
import {listSnapshots} from "./history.js";

type Hold={date:string;captured_at:string;holdings_value_krw:number};
type Nav={date:string;captured_at:string;reported_net_assets_krw:number;verified_full_nav:false;reconciliation_status:string};
export function evaluateDailyCaptureGate(holdings:Hold[],nav:Nav[],now=new Date()){
 const report=inspectCaptureState(holdings,nav,now);
 const date=report.seoul_today;
 const clock=report.seoul_clock;
 const daytimeReady=clock!==null&&clock>="20:50";
 if(!daytimeReady||!date){
   return {decision:"PENDING_VALIDATION_WINDOW",date,
     due:false,pair_verified:false,
     source_integrity_only:true,portfolio_return_enabled:false,
     findings:[] as string[],
     note:"20:50 KST 이전에는 실제 자동 기록 누락을 판정하지 않습니다."};
 }
 const h=holdings.find(x=>x.date===date);
 const n=nav.find(x=>x.date===date);
 const issues:string[]=[];
 if(!h)issues.push("HOLDINGS_MISSING_FOR_TODAY");
 if(!n)issues.push("NAV_CANDIDATE_MISSING_FOR_TODAY");
 if(h&&!Number.isFinite(h.holdings_value_krw))issues.push("INVALID_HOLDINGS_VALUE");
 if(n&&!Number.isFinite(n.reported_net_assets_krw))issues.push("INVALID_NAV_CANDIDATE_VALUE");
 if(n&&n.verified_full_nav!==false)issues.push("NAV_CANDIDATE_INCORRECTLY_CLAIMS_VERIFICATION");
 if(n&&n.reconciliation_status==="DIFFERENCE_REQUIRES_REVIEW")issues.push("BROKER_LINE_ITEM_RECONCILIATION_PENDING");
 const pair=report.paired_observations.find(x=>x.date===date);
 if(pair?.capture_gap_minutes===null&&h&&n)issues.push("UNKNOWN_CAPTURE_TIMESTAMPS");
 if(pair?.capture_gap_minutes!==null&&pair?.capture_gap_minutes!==undefined&&pair.capture_gap_minutes>30)
   issues.push("CAPTURE_TIMESTAMPS_MORE_THAN_30_MINUTES_APART");
 const sourceIssue=issues.some(x=>[
  "HOLDINGS_MISSING_FOR_TODAY","NAV_CANDIDATE_MISSING_FOR_TODAY",
  "INVALID_HOLDINGS_VALUE","INVALID_NAV_CANDIDATE_VALUE",
  "NAV_CANDIDATE_INCORRECTLY_CLAIMS_VERIFICATION",
  "UNKNOWN_CAPTURE_TIMESTAMPS","CAPTURE_TIMESTAMPS_MORE_THAN_30_MINUTES_APART"
 ].includes(x));
 return {
  decision:sourceIssue?"CAPTURE_INTEGRITY_REVIEW_REQUIRED":
    issues.length?"CAPTURED_ACCOUNTING_REVIEW_REQUIRED":"CAPTURED_SOURCE_CHECK_PASS",
  date,due:true,pair_verified:!!h&&!!n&&!sourceIssue,
  source_integrity_only:true,portfolio_return_enabled:false,
  findings:issues,
  capture_gap_minutes:pair?.capture_gap_minutes??null,
  note:"동일 날짜 수집 및 시간 간격에 대한 진단입니다. 순자산 회계 산식/외부 현금흐름/수익률은 검증하지 않았고 누락일 소급적재·자동 브로커 호출은 하지 않았습니다."
 };
}
export async function dailyCaptureGate(now=new Date()){
 const [h,n]=await Promise.all([listSnapshots(),listNavCandidates()]);
 return evaluateDailyCaptureGate(h,n,now);
}

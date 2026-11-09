import {listNavCandidates,type NavCandidate} from "./nav-candidate.js";
import {listSnapshots} from "./history.js";

const floor2=(n:number)=>Math.round(n*100)/100;
function nextCalendarDay(date:string):string {
 const d=new Date(date+"T00:00:00Z");
 d.setUTCDate(d.getUTCDate()+1);
 return d.toISOString().slice(0,10);
}
export function auditNavObservations(candidates:NavCandidate[],holdingsDates:string[]=[]) {
 const ordered=[...candidates].sort((a,b)=>a.date.localeCompare(b.date));
 const holdingSet=new Set(holdingsDates);
 const series=ordered.map((r,i)=>{
   const previous=i?ordered[i-1]:undefined;
   const contiguous=previous?nextCalendarDay(previous.date)===r.date:false;
   const delta=previous?floor2(r.reported_net_assets_krw-previous.reported_net_assets_krw):null;
   const pct=previous&&previous.reported_net_assets_krw>0
     ?floor2(100*(r.reported_net_assets_krw-previous.reported_net_assets_krw)/previous.reported_net_assets_krw):null;
   const evidence=r.accounting_evidence;
   const issues:string[]=[];
   if(!evidence)issues.push("NO_SAME_DAY_COMPOSITION_EVIDENCE");
   if(r.reconciliation_status==="DIFFERENCE_REQUIRES_REVIEW")issues.push("BROKER_ITEM_SUM_MISMATCH");
   if(evidence?.item_delta_less_foreign_margin_krw!==null&&evidence?.item_delta_less_foreign_margin_krw!==undefined
      &&Math.abs(evidence.item_delta_less_foreign_margin_krw)>1)
      issues.push("MARGIN_EXPLANATION_HAS_RESIDUAL");
   if(previous&&!contiguous)issues.push("CALENDAR_GAP_BETWEEN_OBSERVATIONS");
   if(contiguous&&pct!==null&&Math.abs(pct)>=5)issues.push("LARGE_DAY_OVER_DAY_CANDIDATE_CHANGE");
   if(!holdingSet.has(r.date))issues.push("NO_HOLDINGS_SNAPSHOT_ON_DATE");
   return {
     date:r.date,
     reported_nav_candidate_krw:r.reported_net_assets_krw,
     listed_items_minus_broker_assets_krw:r.reconciliation_delta_krw,
     unexplained_margin_residual_krw:evidence?.item_delta_less_foreign_margin_krw??null,
     has_matching_holdings_snapshot:holdingSet.has(r.date),
     has_composition_evidence:!!evidence,
     previous_observation_date:previous?.date??null,
     is_consecutive_calendar_day:contiguous,
     candidate_value_change_krw:delta,
     candidate_value_change_pct:pct,
     flags:issues
   };
 });
 const flagged=series.filter(s=>s.flags.length);
 const flaggedCounts:Record<string,number>={};
 for(const s of flagged)for(const flag of s.flags)flaggedCounts[flag]=(flaggedCounts[flag]??0)+1;
 return {
  observation_count:series.length,
  dates_with_flags:flagged.length,
  flagged_counts:flaggedCounts,
  series,
  thresholds:{large_daily_candidate_change_pct:5,margin_residual_abs_krw:1},
  investment_return_pct:null,
  investment_return_available:false,
  broker_nav_confirmed:false,
  disposition:"DIAGNOSTIC_ONLY_REQUIRES_ACCOUNTING_RECONCILIATION",
  warning:"잔고 후보의 일별 증감률은 투자수익률이 아닙니다. 납입·인출·시세·결제·환율·평가시점이 혼재하므로 변동 경고로만 사용합니다. 이 결과는 자동 매매나 알림 발송을 실행하지 않습니다."
 };
}
export async function navAnomalyReport(month?:string){
 const [candidates,holdings]=await Promise.all([listNavCandidates(month),listSnapshots(month)]);
 return auditNavObservations(candidates,holdings.map(s=>s.date));
}

import {listNavCandidates} from "./nav-candidate.js";

export function summarizeAccountingTrend(records:Awaited<ReturnType<typeof listNavCandidates>>){
 const sorted=[...records].sort((a,b)=>a.date.localeCompare(b.date));
 const rows=sorted.map(r=>{
   const e=r.accounting_evidence;
   const delta=r.reconciliation_delta_krw;
   return {
    date:r.date,broker_nav_candidate_krw:r.reported_net_assets_krw,
    listed_items_delta_krw:delta,
    foreign_margin_krw:e?.foreign_margin_krw??null,
    delta_minus_margin_krw:e?.item_delta_less_foreign_margin_krw??null,
    foreign_cash_minus_margin_and_orderable_krw:e?.foreign_cash_less_margin_and_orderable_krw??null,
    has_same_day_composition_evidence:!!e,
    verified_full_nav:false,
   };
 });
 const evidenced=rows.filter(r=>r.has_same_day_composition_evidence);
 const samples=evidenced.filter(r=>r.delta_minus_margin_krw!==null);
 const stableResidual=samples.length>=2&&samples.every(x=>x.delta_minus_margin_krw===samples[0].delta_minus_margin_krw);
 return {
   recorded_days:rows.length,
   composition_evidenced_days:evidenced.length,
   compared_residual_days:samples.length,
   stable_residual_over_multiple_days:samples.length>=2?stableResidual:null,
   date_series:rows,
   confirmed_accounting_formula:false,
   investor_return_available:false,
   blockers:[
    "동일 일자에 확인된 NH 회계 정의 또는 증빙 원장 없이 항목 합계 차이를 자동 차감하지 않음",
    "외화 예수금·담보·주문가능액의 중복 표시 여부에 대한 증권사 설명 필요",
    "외부 입출금의 독립 증빙과 기간별 완전한 현금흐름 검증 필요"
   ],
   note:"이전 저장소 기록에는 회계 항목 상세가 없어서 결측값으로 표시합니다. 같은 일자와 같은 회계 기준으로 채집한 잔차만 비교하며, 값이 안정적이어도 원인 증명은 아닙니다."
 };
}
export async function navAccountingTrend(month?:string){
 return summarizeAccountingTrend(await listNavCandidates(month));
}

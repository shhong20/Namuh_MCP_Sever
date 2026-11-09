import type { Config } from "./config.js";
import { transferReviewQueue } from "./transfer-queue.js";

export type ProvenanceEvidence={
 case_id:string;
 evidence_kind:"bank_statement"|"broker_statement"|"personal_note";
 external_record_date:string;
 external_record_amount:number;
 external_record_currency:"KRW"|"USD"|"JPY"|"EUR"|"OTHER"|"UNKNOWN";
 origin_account_relation:"own_external_cash_account"|"own_investment_account"|"third_party"|"unknown";
 source_movement_direction:"out"|"in"|"unknown";
 independently_reviewed:boolean;
};

function validDay(x:string):boolean{
 if(!/^\d{8}$/.test(x))return false;
 const iso=x.slice(0,4)+"-"+x.slice(4,6)+"-"+x.slice(6);
 return !Number.isNaN(Date.parse(iso+"T00:00:00Z"))&&new Date(iso+"T00:00:00Z").toISOString().slice(0,10)===iso;
}
export function assessIndependentEvidence(review:any,e:ProvenanceEvidence){
 const item=(review.review_cases??[]).find((x:any)=>x.case_id===e.case_id);
 if(!item)throw new Error("검토 목록에 존재하지 않는 사건 ID");
 if(!validDay(e.external_record_date))throw new Error("증빙 거래일이 유효하지 않습니다.");
 if(!Number.isFinite(e.external_record_amount)||e.external_record_amount<=0)
   throw new Error("증빙 금액은 양수여야 합니다.");
 const matchingDate=e.external_record_date===item.date||e.external_record_date===item.actual_date;
 const matchingAmount=item.amount!==null&&Math.abs(e.external_record_amount-item.amount)<0.005;
 const knownCurrency=item.currency!=="UNSPECIFIED"&&item.currency!=="UNKNOWN";
 const currencyMatched=knownCurrency&&e.external_record_currency===item.currency;
 const directionExpected=item.candidate_kind==="transfer_in_candidate"?"out":"in";
 const directionMatched=e.source_movement_direction===directionExpected;
 const independentlyCorroborated=
   e.evidence_kind!=="personal_note"&&e.independently_reviewed&&matchingDate&&matchingAmount&&currencyMatched&&directionMatched;
 let classification:"POTENTIAL_EXTERNAL_CONTRIBUTION"|"POTENTIAL_EXTERNAL_WITHDRAWAL"|"INTERNAL_INVESTMENT_TRANSFER"|"REQUIRES_MORE_EVIDENCE"="REQUIRES_MORE_EVIDENCE";
 if(independentlyCorroborated){
   if(e.origin_account_relation==="own_investment_account")classification="INTERNAL_INVESTMENT_TRANSFER";
   else if(e.origin_account_relation==="own_external_cash_account"){
     classification=item.candidate_kind==="transfer_in_candidate"
       ?"POTENTIAL_EXTERNAL_CONTRIBUTION":"POTENTIAL_EXTERNAL_WITHDRAWAL";
   }
 }
 const missing:string[]=[];
 if(!matchingDate)missing.push("거래일 불일치");
 if(!matchingAmount)missing.push("거래금액 불일치");
 if(!knownCurrency)missing.push("NH 입출금 원장의 통화코드 미제공 — 원천 증빙과 통화 대조 불가");
 else if(!currencyMatched)missing.push("통화 불일치");
 if(!directionMatched)missing.push("증빙 이체 방향 불일치");
 if(e.evidence_kind==="personal_note")missing.push("독립 금융기관 명세서 아님");
 if(!e.independently_reviewed)missing.push("독립 증빙 검토 여부 미확인");
 if(e.origin_account_relation==="unknown")missing.push("계좌 소유 및 투자 포트폴리오 경계 미확인");
 return {
   case_id:item.case_id,
   month:review.month,
   source_pages_complete:review.pages_complete,
   matched_date:matchingDate,matched_amount:matchingAmount,
   matched_currency:currencyMatched,matched_direction:directionMatched,
   evidence_corroboration:independentlyCorroborated,
   classification,
   verification_gaps:missing,
   approved_external_flow_krw:null,
   verified_external_flow:false,
   automatic_return_enabled:false,
   note:"사용자가 제공한 검토 필드에 대한 비교일 뿐 외부 계좌 원본을 직접 읽거나 진위를 인증하지 않습니다. NH 원장에 통화 표기가 없으면 정합성을 확정할 수 없고, 단일 거래 대조만으로 기간 전체의 현금흐름 완전성을 주장하지 않습니다."
 };
}
export async function liveEvidenceCheck(config:Config,month:string,e:ProvenanceEvidence){
 const review=await transferReviewQueue(config,month);
 return assessIndependentEvidence(review,e);
}

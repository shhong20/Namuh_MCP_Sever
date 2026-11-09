import { createHash } from "node:crypto";
import type { Config } from "./config.js";
import { monthlyCommonLedger } from "./common-ledger.js";

type SafeMove={
 date:string;actual_date:string;amount:number|null;currency:string;
 description:string;category:string;matched_comprehensive_record:boolean;
 match_quality:string;externally_verified:boolean;
};
export function buildTransferReviewQueue(ledger:any){
 const movements=(ledger?.cashflow_crosscheck?.reviewed_movements??[]) as SafeMove[];
 const pending=movements.filter(m=>m.category==="transfer_in_candidate"||m.category==="transfer_out_candidate");
 const occurrences=new Map<string,number>();
 const cases=pending.map(m=>{
  const base=[m.date,m.actual_date,m.amount,m.currency,m.description,m.category].join("|");
  const index=occurrences.get(base)??0;
  occurrences.set(base,index+1);
  return {
    case_id:createHash("sha256").update(base+"|"+String(index)).digest("hex").slice(0,16),
    date:m.date,amount:m.amount,currency:m.currency,
    candidate_kind:m.category,
    matched_to_comprehensive_history:m.matched_comprehensive_record,
    transaction_match_quality:m.match_quality,
    external_origin_verified:false,
    verification_status:"NEEDS_INDEPENDENT_ORIGIN_EVIDENCE",
    evidence_required:[
      "입금/출금과 동일한 날짜·금액이 명시된 계좌 외부 금융기관 또는 거래 상대 원장",
      "동일 소유자의 다른 투자계좌로부터 이체된 내부 이전인지 확인",
      "거래 통화(KRW/USD 등)와 환전 또는 결제 관련 여부 검증",
    ]
  };
 });
 return {
  month:ledger.month,
  pages_complete:ledger.all_source_pages_complete,
  review_cases:cases,
  candidate_count:cases.length,
  verified_external_flow_count:0,
  verified_external_flow_krw:null,
  portfolio_return_eligible:false,
  note:"거래원장 쌍이 일치해도 외부 원금 유입으로 자동 승인하지 않습니다. 검토 항목 식별자는 상대방 정보 없이 만들어진 비밀이 아닌 해시입니다."
 };
}
export async function transferReviewQueue(config:Config,month:string){
 const ledger=await monthlyCommonLedger(config,month);
 return buildTransferReviewQueue(ledger);
}

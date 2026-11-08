/** Cashflow reconciliation never equates a transfer with a verified new contribution. */
export type SafeLedgerRow={
 date:string; actual_date:string; currency:string; amount:number|null;
 transaction_type:string; description:string; direction_candidate:string;
 externally_verified:boolean;
};
export function classifyMoneyMovement(r:SafeLedgerRow){
 const label=r.description.replace(/\s+/g,"").trim();
 const direction=r.direction_candidate;
 if(/배당금입금|배당금/.test(label))return "internal_dividend";
 if(/예탁금이용료|이자입금|이자지급|이자/.test(label))return "internal_interest";
 if(/환전|외화매수|외화매도|환매도|환매수/.test(label))return "internal_currency_or_settlement";
 if(/주식|증권|매수|매도|매매|결제/.test(label))return "internal_security_activity";
 if(/이체|대체|입금|출금|송금/.test(label)&&["in","out"].includes(direction))
  return direction==="in"?"transfer_in_candidate":"transfer_out_candidate";
 return "unclassified";
}
export function auditMatchedMovements(
 deposits:SafeLedgerRow[], transactions:SafeLedgerRow[],
 depositsComplete:boolean,transactionsComplete:boolean
){
 // Compare dated and valued source records; descriptions may not match across APIs.
 // A many-to-many collision is not sufficient to establish transaction identity.
 const postings=transactions.filter(t=>t.amount!==null&&/^\d{8}$/.test(t.date));
 const used=new Set<number>();
 const movements=deposits.map(d=>{
  const category=classifyMoneyMovement(d);
  const matches=postings.map((t,i)=>({t,i})).filter(({t,i})=>
    !used.has(i)&&d.date===t.date&&d.amount!==null&&t.amount===d.amount);
  const exact=matches.filter(({t})=>t.description===d.description);
  const unambiguous=exact.length===1?exact:matches.length===1?matches:[];
  const match=unambiguous[0];
  if(match)used.add(match.i);
  return {
    ...d,category,matched_comprehensive_record:!!match,
    match_quality:exact.length===1?"date_amount_label":
      matches.length===1?"date_amount":"unresolved",
    externally_verified:false
  };
 });
 const categories=Object.fromEntries([
  "internal_dividend","internal_interest","internal_currency_or_settlement",
  "internal_security_activity","transfer_in_candidate","transfer_out_candidate","unclassified"
 ].map(k=>[k,movements.filter(m=>m.category===k).length]));
 const unmatched=movements.filter(m=>!m.matched_comprehensive_record).length;
 return {
   categories,matched_count:movements.length-unmatched,unmatched_count:unmatched,
   source_pages_complete:depositsComplete&&transactionsComplete,
   actual_external_contribution_krw:null,
   actual_external_withdrawal_krw:null,
   verified_net_external_flow_krw:null,
   ready_for_portfolio_return:false,
   reviewed_movements:movements,
   warning:"두 NH 조회 결과가 일치하더라도 '이체입금'은 원천 자금의 외부 유입이 입증되지 않습니다. 입금·출금·내부 이체·계좌 간 자금 이동 원천을 추가 검증해야 합니다."
 };
}

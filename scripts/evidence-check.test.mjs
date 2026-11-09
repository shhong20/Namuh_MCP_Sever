import test from "node:test";
import assert from "node:assert/strict";
import {assessIndependentEvidence} from "../dist/evidence-check.js";

const review={month:"2026-10",pages_complete:true,review_cases:[
  {case_id:"921ce46bd98fc388",date:"20261015",actual_date:"20261015",
   amount:300000,currency:"UNSPECIFIED",candidate_kind:"transfer_in_candidate"}
]};
const evidence={case_id:"921ce46bd98fc388",evidence_kind:"bank_statement",
 external_record_date:"20261015",external_record_amount:300000,
 external_record_currency:"KRW",origin_account_relation:"own_external_cash_account",
 source_movement_direction:"out",independently_reviewed:true};
test("missing broker-side currency prevents corroborating claimed bank transfer",()=>{
 const out=assessIndependentEvidence(review,evidence);
 assert.equal(out.matched_date,true);
 assert.equal(out.matched_amount,true);
 assert.equal(out.matched_currency,false);
 assert.equal(out.evidence_corroboration,false);
 assert.equal(out.classification,"REQUIRES_MORE_EVIDENCE");
 assert.equal(out.approved_external_flow_krw,null);
 assert.equal(out.automatic_return_enabled,false);
 assert.ok(out.verification_gaps.some(x=>x.includes("통화코드")));
});
test("even matching currency and user-attested external account never auto approves",()=>{
 const reviewWithCurrency={...review,review_cases:[{...review.review_cases[0],currency:"KRW"}]};
 const out=assessIndependentEvidence(reviewWithCurrency,evidence);
 assert.equal(out.evidence_corroboration,true);
 assert.equal(out.classification,"POTENTIAL_EXTERNAL_CONTRIBUTION");
 assert.equal(out.verified_external_flow,false);
 assert.equal(out.approved_external_flow_krw,null);
});
test("same investor's invested account is not fresh capital",()=>{
 const rev={...review,review_cases:[{...review.review_cases[0],currency:"KRW"}]};
 const out=assessIndependentEvidence(rev,{...evidence,origin_account_relation:"own_investment_account"});
 assert.equal(out.classification,"INTERNAL_INVESTMENT_TRANSFER");
 assert.equal(out.approved_external_flow_krw,null);
});
test("notes, mismatched date, duplicated identity and future dates fail safely",()=>{
 assert.throws(()=>assessIndependentEvidence(review,{...evidence,case_id:"bad"}));
 assert.throws(()=>assessIndependentEvidence(review,{...evidence,external_record_date:"20260230"}));
 const out=assessIndependentEvidence(review,{...evidence,evidence_kind:"personal_note",external_record_date:"20261016",external_record_amount:300001});
 assert.equal(out.evidence_corroboration,false);
 assert.equal(out.verification_gaps.length>=3,true);
});

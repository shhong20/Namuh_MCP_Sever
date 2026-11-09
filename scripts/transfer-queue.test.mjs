import test from "node:test";
import assert from "node:assert/strict";
import { buildTransferReviewQueue } from "../dist/transfer-queue.js";
test("only transfer candidates require evidence and stable IDs expose no counterparty",()=>{
 const report={month:"2026-10",all_source_pages_complete:true,
   cashflow_crosscheck:{reviewed_movements:[
    {date:"20261001",actual_date:"20261001",amount:15000,currency:"UNSPECIFIED",description:"외화배당금입금",category:"internal_dividend",matched_comprehensive_record:true,match_quality:"date_amount_label",externally_verified:false},
    {date:"20261001",actual_date:"20261001",amount:300000,currency:"UNSPECIFIED",description:"이체입금",category:"transfer_in_candidate",matched_comprehensive_record:true,match_quality:"date_amount_label",externally_verified:false},
   ]}};
 const r=buildTransferReviewQueue(report);
 assert.equal(r.candidate_count,1);
 assert.equal(r.review_cases[0].amount,300000);
 assert.equal(r.verified_external_flow_krw,null);
 assert.equal(r.portfolio_return_eligible,false);
 assert.equal(r.review_cases[0].external_origin_verified,false);
 assert.equal(r.review_cases[0].case_id,buildTransferReviewQueue(report).review_cases[0].case_id);
 assert.equal(JSON.stringify(r).includes("act_no"),false);
});
test("duplicate matching transfer details have distinct review IDs",()=>{
 const v={date:"20261001",actual_date:"20261001",amount:300000,currency:"UNSPECIFIED",description:"이체입금",category:"transfer_in_candidate",matched_comprehensive_record:false,match_quality:"unresolved",externally_verified:false};
 const q=buildTransferReviewQueue({month:"2026-10",all_source_pages_complete:true,cashflow_crosscheck:{reviewed_movements:[v,v]}});
 assert.equal(new Set(q.review_cases.map(x=>x.case_id)).size,2);
});

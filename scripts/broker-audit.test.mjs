import test from "node:test";
import assert from "node:assert/strict";
import {
 auditMonthlyBrokerEvidence,summarizeAnnualEvidence,quoteCrosscheck
} from "../dist/broker-audit.js";

const page=(code,rows,cts=null,flag="N")=>({
 data:{rsp_cd:code,Output_0:{fc_rzt_pls_sum:0},Output_1:rows},
 continuation:{cts,flag}
});

test("yearly tax evidence: no rows does not imply zero taxable gains",async()=>{
 const m=await auditMonthlyBrokerEvidence("2026-06",async()=>page("13578",[],"opaque","N"));
 assert.equal(m.status,"NO_ROWS_REPORTED");
 const x=summarizeAnnualEvidence(2026,[m]);
 assert.equal(x.basic_deduction_remaining_krw,null);
 assert.equal(x.tax_basis_krw_realized_verified,false);
 assert.equal(x.broker_account_yearly_ledger_complete_verified,false);
 assert.equal(x.orders_submitted,false);
 assert.equal(JSON.stringify(x).includes("opaque"),false);
});
test("continuation collects bounded pages but never prints broker cursor",async()=>{
 const seen=[];
 const m=await auditMonthlyBrokerEvidence("2026-07",async(cts,flag)=>{
  seen.push(cts??"INITIAL");
  if(!cts)return page("00218",[{id:1}],"sensitive-secret","Y");
  return page("00166",[{id:2}],null,"N");
 });
 assert.deepEqual(seen,["INITIAL","sensitive-secret"]);
 assert.equal(m.status,"OBSERVED_RECORDS");
 assert.equal(m.row_count,2);
 assert.equal(m.page_count,2);
 assert.equal(JSON.stringify(m).includes("sensitive-secret"),false);
});
test("continuation without cursor fails closed",async()=>{
 const m=await auditMonthlyBrokerEvidence("2026-08",async()=>page("00218",[{id:1}],null,"Y"));
 assert.equal(m.status,"INCOMPLETE");
 assert.equal(m.failure_reason,"CONTINUATION_MISSING");
});
test("duplicate repeated data fails closed",async()=>{
 const m=await auditMonthlyBrokerEvidence("2026-09",async cts=>cts?
  page("00166",[{id:1}]):page("00218",[{id:1}],"cursor","Y"));
 assert.equal(m.status,"INCOMPLETE");
 assert.equal(m.failure_reason,"DUPLICATE_RECORD");
});
test("broker empty response with records is contradiction",async()=>{
 const m=await auditMonthlyBrokerEvidence("2026-10",async()=>page("13578",[{id:2}]));
 assert.equal(m.status,"INCOMPLETE");
});
test("max pages and unknown response fail closed",async()=>{
 const m=await auditMonthlyBrokerEvidence("2026-10",async cts=>
  page("00218",[{seq:cts??"start"}],(cts??"start")+"-next","Y"),2);
 assert.equal(m.failure_reason,"MAX_PAGES");
 const bad=await auditMonthlyBrokerEvidence("2026-10",async()=>page("00219",[]));
 assert.equal(bad.status,"INCOMPLETE");
});
test("zero broker valuation quote is indicative only",()=>{
 const o=quoteCrosscheck({symbol:"0193T0",quantity:38,broker_market_value_krw:0,
  last_price_krw:4640,quote_code:"00000",quote_timestamp:"09:39:46"});
 assert.equal(o.ok,true);
 assert.equal(o.indicative_market_value_krw,176320);
 assert.equal(o.broker_market_value_replaced,false);
 assert.equal(o.buy_or_sell_trigger,false);
 assert.equal(o.valuation_mismatch,true);
});
test("failed or invalid quote never substitutes a price",()=>{
 const x=quoteCrosscheck({symbol:"0193T0",quantity:38,broker_market_value_krw:0,
  last_price_krw:0,quote_code:"00000",quote_timestamp:null});
 assert.equal(x.ok,false);
 const y=quoteCrosscheck({symbol:"0193T0",quantity:38,broker_market_value_krw:0,
  last_price_krw:4640,quote_code:"00218",quote_timestamp:null});
 assert.equal(y.ok,false);
});

test("quote response for a different symbol is rejected",()=>{
 const x=quoteCrosscheck({symbol:"0193T0",quantity:38,broker_market_value_krw:0,last_price_krw:4640,quote_code:"00000",quote_timestamp:null,quote_symbol:"005930"});
 assert.equal(x.ok,false);
 assert.equal(x.reason,"QUOTE_SYMBOL_MISMATCH");
});

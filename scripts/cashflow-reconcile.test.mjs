import test from "node:test";
import assert from "node:assert/strict";
import { auditMatchedMovements, classifyMoneyMovement } from "../dist/cashflow-reconcile.js";

const row=(date,description,amount,direction_candidate="in")=>({
 date,actual_date:date,currency:"UNSPECIFIED",amount,description,
 direction_candidate,transaction_type:direction_candidate==="in"?"입금":"출금",externally_verified:false
});
test("dividends and deposit interest remain internal not investor deposits",()=>{
 const deposits=[
  row("20261002","외화배당금입금",2.5),
  row("20261008","외화배당금입금",1.2),
  row("20261021","예탁금이용료",15),
  row("20261027","이체입금",100000)
 ];
 const t=deposits.map(d=>({...d,currency:"USD"}));
 const a=auditMatchedMovements(deposits,t,true,true);
 assert.equal(a.categories.internal_dividend,2);
 assert.equal(a.categories.internal_interest,1);
 assert.equal(a.categories.transfer_in_candidate,1);
 assert.equal(a.matched_count,4);
 assert.equal(a.actual_external_contribution_krw,null);
 assert.equal(a.ready_for_portfolio_return,false);
 assert.ok(a.reviewed_movements.every(x=>x.externally_verified===false));
});
test("duplicate amount on same date without matching description fails closed",()=>{
 const a=auditMatchedMovements([row("20261001","이체입금",100)],
  [row("20261001","기타",100),row("20261001","기타",100)],true,true);
 assert.equal(a.unmatched_count,1);
 assert.equal(a.reviewed_movements[0].match_quality,"unresolved");
});
test("unmatched transactions or incomplete page never assert audited complete flows",()=>{
 const a=auditMatchedMovements([row("20261001","이체입금",100)],[],true,false);
 assert.equal(a.source_pages_complete,false);
 assert.equal(a.verified_net_external_flow_krw,null);
 assert.equal(classifyMoneyMovement(row("20261001","외화배당금입금",100)),"internal_dividend");
});

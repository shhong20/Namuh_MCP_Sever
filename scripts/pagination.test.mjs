import test from "node:test";
import assert from "node:assert/strict";
import { collectBrokerPages } from "../dist/pagination.js";

const make=(code,rows,cts=null)=>({data:{rsp_cd:code,Output_0:{nas_amt:0},Output_1:rows},continuation:{cts,flag:code==="00218"?"Y":"N"}});
test("opaque continuation cursor traverses pages without logging token",async()=>{
 const tokens=[];
 const flags=[];
 const a=await collectBrokerPages(async (cts,flag)=>{
  tokens.push(cts??"INITIAL");
  flags.push(flag??"INITIAL");
  if(!cts)return make("00218",[{iem_cd:"A"}],"opaque-secret-1");
  if(cts==="opaque-secret-1")return make("00218",[{iem_cd:"B"}],"opaque-secret-2");
  return make("00166",[{iem_cd:"C"}]);
 });
 assert.deepEqual(tokens,["INITIAL","opaque-secret-1","opaque-secret-2"]);
 assert.deepEqual(flags,["INITIAL","Y","Y"]);
 assert.equal(a.audit.page_count,3);
 assert.equal(a.audit.complete,true);
 assert.equal(a.data.Output_1.length,3);
 assert.equal(JSON.stringify(a.audit).includes("opaque-secret"),false);
});
test("missing and reused cursor are incomplete",async()=>{
 const x=await collectBrokerPages(async()=>make("00218",[{x:1}],null));
 assert.equal(x.audit.failure_reason,"continuation_cursor_missing");
 assert.equal(x.audit.complete,false);
 const y=await collectBrokerPages(async()=>make("00218",[{x:1}],"same"));
 assert.equal(y.audit.failure_reason,"duplicate_identical_rows_across_pages");
 assert.equal(y.audit.complete,false);
});
test("duplicate records cannot be declared complete",async()=>{
 const r=await collectBrokerPages(async c=>c?make("00166",[{x:1}]):make("00218",[{x:1}],"next"));
 assert.equal(r.audit.complete,false);
 assert.equal(r.audit.duplicate_rows,1);
});
test("bounded iteration fails safely",async()=>{
 const r=await collectBrokerPages(async c=>make("00218",[{id:c??"start"}],"token-"+(c??"start")),2);
 assert.equal(r.audit.complete,false);
 assert.equal(r.audit.failure_reason,"max_pages_exceeded");
 await assert.rejects(()=>collectBrokerPages(async()=>make("00166",[]),51));
});

import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync,chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {sanitizeRow,save} from "./export_diagnostic_evidence.mjs";
import {diagnosticEvidence} from "../dist/diagnostic-evidence.js";
import {captureOpsReport} from "../dist/capture-ops.js";
import {captureInvocationReport} from "../dist/capture-invocations.js";
import {scheduleCoverageReport} from "../dist/capture-schedule-coverage.js";
const now=Date.now(),uid="a".repeat(32);
const row={_SYSTEMD_USER_UNIT:"namuh-portfolio-snapshot.service",SYSLOG_IDENTIFIER:"node",_BOOT_ID:uid,_SYSTEMD_INVOCATION_ID:uid,__REALTIME_TIMESTAMP:String(now*1000),MESSAGE:JSON.stringify({decision:"SNAPSHOT_OK",date:"2026-11-24",created:true,secret:"FAKE_SECRET",account:"FAKE_ACCOUNT"}),secret:"FAKE_SECRET"};
test("only allowlisted metadata survives export",()=>{
 const v=sanitizeRow(row);
 assert.ok(v);
 assert.equal(JSON.parse(v.MESSAGE).decision,"SNAPSHOT_OK");
 assert.ok(!JSON.stringify(v).includes("FAKE_"));
 assert.equal(sanitizeRow({...row,_SYSTEMD_USER_UNIT:"unrelated.service"}),null);
 assert.equal(sanitizeRow({...row,MESSAGE:"arbitrary content"}),null);
});
test("reports read private evidence and reject stale or overpermissive data",()=>{
 const root=mkdtempSync(join(tmpdir(),"diag-evidence-"));
 const prior=process.env.NH_DIAGNOSTIC_EVIDENCE;
 try{
  const file=join(root,"evidence.json");
  process.env.NH_DIAGNOSTIC_EVIDENCE=file;
  const e={version:1,generated_utc:new Date(now).toISOString(),rows:[sanitizeRow(row)],boots:[],statuses:{}};
  save(e,root);
  assert.equal(diagnosticEvidence(1).rows.length,1);
  assert.equal(captureOpsReport(1).records_observed,1);
  assert.equal(captureInvocationReport(30).invocation_count,1);
  assert.equal(scheduleCoverageReport(90).lookback_days,90);
  assert.equal(captureOpsReport(1).diagnostic_source,"READ_ONLY_HOST_EVIDENCE");
  assert.throws(()=>diagnosticEvidence(91));
  save({...e,generated_utc:new Date(now-181000).toISOString()},root);
  assert.throws(()=>captureOpsReport(1),/STALE/);
  save(e,root);chmodSync(file,0o644);
  assert.throws(()=>diagnosticEvidence(1),/INVALID/);
 }finally{if(prior===undefined)delete process.env.NH_DIAGNOSTIC_EVIDENCE;else process.env.NH_DIAGNOSTIC_EVIDENCE=prior;rmSync(root,{recursive:true,force:true});}
});

test("validation reason and capture gap survive export without arbitrary data",()=>{
 const event={...row,_SYSTEMD_USER_UNIT:"namuh-capture-validation.service",MESSAGE:JSON.stringify({decision:"CAPTURE_INTEGRITY_REVIEW_REQUIRED",date:"2026-11-24",findings:["CAPTURE_TIMESTAMPS_MORE_THAN_30_MINUTES_APART","FAKE_SECRET"],capture_gap_minutes:323,pair_verified:false,account:"FAKE_ACCOUNT"})};
 const sanitized=sanitizeRow(event);
 const data=JSON.parse(sanitized.MESSAGE);
 assert.deepEqual(data.findings,["CAPTURE_TIMESTAMPS_MORE_THAN_30_MINUTES_APART"]);
 assert.equal(data.capture_gap_minutes,323);assert.equal(data.pair_verified,false);
 assert.ok(!JSON.stringify(sanitized).includes("FAKE_"));
 const root=mkdtempSync(join(tmpdir(),"diag-finding-"));const prior=process.env.NH_DIAGNOSTIC_EVIDENCE;
 try{process.env.NH_DIAGNOSTIC_EVIDENCE=join(root,"evidence.json");save({version:1,generated_utc:new Date(now).toISOString(),rows:[sanitized],boots:[],statuses:{}},root);
 const latest=captureOpsReport(1).services.validation.latest_event;
 assert.equal(latest.capture_gap_minutes,323);assert.deepEqual(latest.findings,data.findings);
 }finally{if(prior===undefined)delete process.env.NH_DIAGNOSTIC_EVIDENCE;else process.env.NH_DIAGNOSTIC_EVIDENCE=prior;rmSync(root,{recursive:true,force:true});}
});

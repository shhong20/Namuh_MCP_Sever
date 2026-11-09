import test from "node:test";
import assert from "node:assert/strict";
import {correlateSystemdInvocations} from "../dist/capture-invocations.js";
const uid="1234567890abcdef1234567890abcdef";
const unit="namuh-portfolio-snapshot.service";
const boot="testboot";
const at=(ms)=>String(ms*1000);
const start={USER_UNIT:unit,USER_INVOCATION_ID:uid,_BOOT_ID:boot,
 SYSLOG_IDENTIFIER:"systemd",JOB_TYPE:"start",__REALTIME_TIMESTAMP:at(1794184800000),
 MESSAGE:"Starting namuh-portfolio-snapshot.service"};
const app={_SYSTEMD_USER_UNIT:unit,_SYSTEMD_INVOCATION_ID:uid,_BOOT_ID:boot,SYSLOG_IDENTIFIER:"node",
 __REALTIME_TIMESTAMP:at(1794184800110),
 MESSAGE:JSON.stringify({decision:"SNAPSHOT_OK",account_number:"SECRET_ACCOUNT",duration_ms:12})};
const done={...start,__REALTIME_TIMESTAMP:at(1794184800130),JOB_RESULT:"done",MESSAGE:"Finished"};
test("start/application/terminal records with same boot and invocation are joined and redacted",()=>{
 const a=correlateSystemdInvocations([start,app,done],{
  holdings:{result:"success",exit_code:0,invocation_id:uid,
  timer_last_trigger_utc:null,timer_active:true}
 });
 assert.equal(a.invocation_count,1);
 assert.equal(a.invocations[0].invocation_classification,"MANAGER_AND_APPLICATION_RESULT_MATCHED");
 assert.equal(a.invocations[0].latest_unit_exit_code,0);
 assert.equal(a.invocations[0].latest_unit_exit_code_correlated,true);
 assert.equal(a.invocations[0].timer_activation_proven,false);
 assert.equal(a.confirmed_timer_triggered_invocations,0);
 assert.equal(a.schedule_success_rate,null);
 assert.equal(JSON.stringify(a).includes("SECRET_ACCOUNT"),false);
 assert.equal(JSON.stringify(a).includes(uid),false);
});
test("older invocation does not receive current exit code; partial app-only event remains separate",()=>{
 const old="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
 const x=correlateSystemdInvocations([{...app,_SYSTEMD_INVOCATION_ID:old}],{
  holdings:{result:"failed",exit_code:2,invocation_id:uid,timer_last_trigger_utc:null,timer_active:true}
 });
 assert.equal(x.invocations[0].invocation_classification,"APPLICATION_EVENT_NO_SYSTEMD_RESULT");
 assert.equal(x.invocations[0].latest_unit_exit_code,null);
 assert.equal(x.invocations[0].latest_unit_exit_code_correlated,false);
});
test("cross boot identical invocation IDs and unknown events do not accidentally merge",()=>{
 const x=correlateSystemdInvocations([start,done,{...app,_BOOT_ID:"other-boot"},
  {...app,_SYSTEMD_USER_UNIT:"bad.service"},
  {...app,_SYSTEMD_INVOCATION_ID:"bad",MESSAGE:"not-json"}]);
 assert.equal(x.invocation_count,2);
 assert.equal(x.invocations.filter(r=>r.invocation_classification==="SYSTEMD_RESULT_NO_APPLICATION_EVENT").length,1);
 assert.equal(x.invocations.filter(r=>r.invocation_classification==="APPLICATION_EVENT_NO_SYSTEMD_RESULT").length,1);
});

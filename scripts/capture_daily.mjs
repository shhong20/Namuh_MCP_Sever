#!/usr/bin/env node
import { loadConfig } from "../dist/config.js";
import { captureDaily } from "../dist/history.js";
import { classifyCaptureError } from "../dist/capture-recovery.js";

const started=process.hrtime.bigint();
const duration_ms=()=>Math.round(Number(process.hrtime.bigint()-started)/1e6);
async function main(){
  const out=await captureDaily(loadConfig());
  console.log(JSON.stringify({
    decision:"SNAPSHOT_OK",date:out.date,created:out.created,
    duration_ms:duration_ms(),
    // Holdings-only capture uses account + domestic + overseas reads when created.
    broker_calls:out.created?3:0,
  }));
}
main().catch(e=>{
 const failure=classifyCaptureError(e);
 console.error(JSON.stringify({decision:"SNAPSHOT_FAILED",failure_kind:failure.kind,duration_ms:duration_ms(),automatic_retry:false,manual_action:failure.manual_action}));
 process.exitCode=1;
});

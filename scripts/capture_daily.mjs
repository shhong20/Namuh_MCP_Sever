#!/usr/bin/env node
import { loadConfig } from "../dist/config.js";
import { captureDaily } from "../dist/history.js";
import { classifyCaptureError } from "../dist/capture-recovery.js";

async function main(){
  const out=await captureDaily(loadConfig());
  console.log(JSON.stringify({
    decision:"SNAPSHOT_OK",date:out.date,created:out.created,
    holdings_value_krw:out.holdings_value_krw,
  }));
}
main().catch(e=>{
 const failure=classifyCaptureError(e);
 console.error(JSON.stringify({decision:"SNAPSHOT_FAILED",failure_kind:failure.kind,automatic_retry:false,manual_action:failure.manual_action}));
 process.exitCode=1;
});

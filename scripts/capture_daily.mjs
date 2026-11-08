#!/usr/bin/env node
import { loadConfig } from "../dist/config.js";
import { captureDaily } from "../dist/history.js";

async function main(){
  const out=await captureDaily(loadConfig());
  console.log(JSON.stringify({
    decision:"SNAPSHOT_OK",date:out.date,created:out.created,
    holdings_value_krw:out.holdings_value_krw,
  }));
}
main().catch(e=>{
 console.error(JSON.stringify({decision:"SNAPSHOT_FAILED",reason:String(e instanceof Error?e.message:e).slice(0,300)}));
 process.exitCode=1;
});

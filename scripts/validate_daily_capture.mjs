import {dailyCaptureGate} from "../dist/daily-capture-gate.js";
const started=process.hrtime.bigint();
const duration_ms=()=>Math.round(Number(process.hrtime.bigint()-started)/1e6);
try {
 const report=await dailyCaptureGate();
 // Log only counts and codes, never holdings, NAV or account identifiers.
 console.log(JSON.stringify({
  decision:report.decision,date:report.date,due:report.due,
  duration_ms:duration_ms(),
  pair_verified:report.pair_verified,
  capture_gap_minutes:report.capture_gap_minutes??null,
  findings:report.findings,investment_return_enabled:report.portfolio_return_enabled
 }));
 if(report.decision==="CAPTURE_INTEGRITY_REVIEW_REQUIRED")process.exitCode=2;
}catch(e){
 console.error(JSON.stringify({
  decision:"CAPTURE_VALIDATION_FAILED",duration_ms:duration_ms(),
  error_type:e instanceof Error?e.name:"unknown",
  // Avoid writing potentially sensitive raw provider or file details to journal.
  action:"Check offline capture files and service log; no broker auto retry performed"
 }));
 process.exitCode=1;
}

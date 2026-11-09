import { loadConfig } from "../dist/config.js";
import { captureNavCandidate } from "../dist/nav-candidate.js";
import { classifyCaptureError } from "../dist/capture-recovery.js";
const started=process.hrtime.bigint();
const duration_ms=()=>Math.round(Number(process.hrtime.bigint()-started)/1e6);
try {
 const r=await captureNavCandidate(loadConfig());
 console.log(JSON.stringify({decision:"NAV_CANDIDATE_OK",date:r.candidate.date,created:r.created,
 broker_calls:r.broker_calls,source_pages:r.created?r.candidate.page_count:0,
 duration_ms:duration_ms(),reconciliation_status:r.candidate.reconciliation_status,
 verified_full_nav:r.candidate.verified_full_nav}));
}catch(e){
 const failure=classifyCaptureError(e);
 console.error(JSON.stringify({decision:"NAV_CANDIDATE_FAILED",failure_kind:failure.kind,duration_ms:duration_ms(),automatic_retry:false,manual_action:failure.manual_action}));
 process.exitCode=1;
}

import { loadConfig } from "../dist/config.js";
import { captureNavCandidate } from "../dist/nav-candidate.js";
import { classifyCaptureError } from "../dist/capture-recovery.js";
try {
 const r=await captureNavCandidate(loadConfig());
 console.log(JSON.stringify({decision:"NAV_CANDIDATE_OK",date:r.candidate.date,created:r.created,
 broker_calls:r.broker_calls,reconciliation_status:r.candidate.reconciliation_status,
 verified_full_nav:r.candidate.verified_full_nav}));
}catch(e){
 const failure=classifyCaptureError(e);
 console.error(JSON.stringify({decision:"NAV_CANDIDATE_FAILED",failure_kind:failure.kind,automatic_retry:false,manual_action:failure.manual_action}));
 process.exitCode=1;
}

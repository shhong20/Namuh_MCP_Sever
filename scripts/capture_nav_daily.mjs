import { loadConfig } from "../dist/config.js";
import { captureNavCandidate } from "../dist/nav-candidate.js";
try {
 const r=await captureNavCandidate(loadConfig());
 console.log(JSON.stringify({decision:"NAV_CANDIDATE_OK",date:r.candidate.date,created:r.created,
 broker_calls:r.broker_calls,reconciliation_status:r.candidate.reconciliation_status,
 verified_full_nav:r.candidate.verified_full_nav}));
}catch(e){
 console.error(JSON.stringify({decision:"NAV_CANDIDATE_FAILED",reason:String(e instanceof Error?e.message:e).slice(0,220)}));
 process.exitCode=1;
}

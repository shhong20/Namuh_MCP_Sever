import {lstatSync,readFileSync} from "node:fs";
export type DiagnosticRow={
 _SYSTEMD_USER_UNIT?:string;USER_UNIT?:string;_SYSTEMD_INVOCATION_ID?:string;
 USER_INVOCATION_ID?:string;__REALTIME_TIMESTAMP?:string;MESSAGE?:string;
 SYSLOG_IDENTIFIER?:string;JOB_RESULT?:string;JOB_TYPE?:string;_BOOT_ID?:string;
};
export type DiagnosticStatus={result:string|null;exit_code:number|null;invocation_id:string|null;timer_last_trigger_utc:string|null;timer_active:boolean|null};
export type DiagnosticEvidence={version:1;generated_utc:string;rows:DiagnosticRow[];boots:{boot_id:string;start_ms:number;end_ms:number}[];statuses:Partial<Record<"holdings"|"nav"|"validation",DiagnosticStatus>>};
export function diagnosticEvidence(days:number,now=Date.now()){
 if(!Number.isInteger(days)||days<1||days>90)throw Error("조회일 범위는 1~90입니다.");
 const file=process.env.NH_DIAGNOSTIC_EVIDENCE;
 if(file===undefined)return null;
 if(!file)throw Error("NH_DIAGNOSTIC_UNAVAILABLE");
 const st=lstatSync(file);
 if(!st.isFile()||st.uid!==process.getuid?.()||(st.mode&0o077)||st.size>4*1024*1024)throw Error("NH_DIAGNOSTIC_INVALID");
 const data=JSON.parse(readFileSync(file,"utf8")) as DiagnosticEvidence;
 const generated=Date.parse(data.generated_utc);
 if(data.version!==1||!Number.isFinite(generated)||generated>now+5000||now-generated>180000||!Array.isArray(data.rows)||data.rows.length>10000||!Array.isArray(data.boots)||!data.statuses)throw Error("NH_DIAGNOSTIC_STALE_OR_INVALID");
 const rows=data.rows.filter(r=>Number(r.__REALTIME_TIMESTAMP)>= (generated-days*86400000)*1000 && Number(r.__REALTIME_TIMESTAMP)<=generated*1000);
 return {...data,rows};
}
export function evidenceMetadata(e:DiagnosticEvidence){
 return {diagnostic_source:"READ_ONLY_HOST_EVIDENCE",diagnostic_generated_utc:e.generated_utc,diagnostic_max_age_seconds:180};
}

import {NhplugApiError} from "./client.js";
import {dailyCaptureGate} from "./daily-capture-gate.js";
import {listSnapshots,currentSeoulDate} from "./history.js";
import {listNavCandidates} from "./nav-candidate.js";

export type FailureKind=
 "AUTH_REQUIRES_REVIEW"|"BROKER_RATE_LIMIT"|"NETWORK_UNAVAILABLE"|
 "BROKER_HTTP_FAILURE"|"SOURCE_PAGINATION_INCOMPLETE"|"BROKER_BUSINESS_RESPONSE_UNEXPECTED"|
 "STORAGE_PERMISSION_OR_INTEGRITY"|"UNKNOWN_FAILURE";
export function classifyCaptureError(error:unknown):{
 kind:FailureKind;automatic_retry_allowed:false;manual_action:string
}{
 if(error instanceof NhplugApiError){
  const kind:FailureKind=error.detail.category==="rate_limit"?"BROKER_RATE_LIMIT":
   error.detail.category==="auth"?"AUTH_REQUIRES_REVIEW":
   error.detail.category==="network"?"NETWORK_UNAVAILABLE":"BROKER_HTTP_FAILURE";
  return {kind,automatic_retry_allowed:false,
   manual_action:kind==="BROKER_RATE_LIMIT"?"증권사 호출 한도 및 갱신 시각 확인 후 별도 승인":
    kind==="AUTH_REQUIRES_REVIEW"?"인증 설정 확인 후 별도 승인":
    kind==="NETWORK_UNAVAILABLE"?"WSL 네트워크/터널 상태 확인 후 별도 승인":
    "API 응답 코드/명세 확인 후 별도 승인"};
 }
 const e=error as {code?:unknown;message?:unknown}|null;
 const code=typeof e?.code==="string"?e.code:"";
 const message=typeof e?.message==="string"?e.message:"";
 if(["EACCES","EPERM","EROFS","ELOOP","ENOSPC"].includes(code)||
    /권한|무결성|스냅샷.*오류|NAV 후보.*오류|파일.*오류/.test(message))
   return {kind:"STORAGE_PERMISSION_OR_INTEGRITY",automatic_retry_allowed:false,
     manual_action:"스냅샷 디렉터리/파일 권한·공간·무결성 확인 후 별도 승인"};
 if(/연속조회 불완전|continuation|페이지.*불완전/i.test(message))
   return {kind:"SOURCE_PAGINATION_INCOMPLETE",automatic_retry_allowed:false,
    manual_action:"연속조회 커서·중복·종료 코드 검사 후 별도 승인"};
 if(/rsp_cd|업무 상태|잔고 API|유효한 양수 NAV 후보|거래내역.*실패/.test(message))
   return {kind:"BROKER_BUSINESS_RESPONSE_UNEXPECTED",automatic_retry_allowed:false,
    manual_action:"업무 응답 종류 확인 후 별도 승인"};
 return {kind:"UNKNOWN_FAILURE",automatic_retry_allowed:false,
   manual_action:"서비스 journal의 상태와 읽기 전용 진단 확인 후 별도 승인"};
}

export function formulateRecoveryPlan(
 holdingsDates:string[],navDates:string[],date:string,hhmm:string,
 sourceGate:string,
){
 const targets=[] as Array<{target:"holdings"|"nav_candidate";decision:string;reason:string}>;
 for(const target of ["holdings","nav_candidate"] as const){
  const found=(target==="holdings"?holdingsDates:navDates).includes(date);
  const due=hhmm>="20:55";
  targets.push({target,decision:found?"ALREADY_CAPTURED_NO_ACTION":
   !due?"WAIT_FOR_SCHEDULE":"ELIGIBLE_FOR_MANUAL_REVIEW",
   reason:found?"같은 날짜의 불변 파일이 이미 존재하므로 API 재호출 불필요":
    !due?"20:55 이전에는 예약된 자동 기록을 기다림":
    "자동 재시도 없음. systemd 결과, 장애 분류, API 호출 한도 확인 및 별도 승인 필요"});
 }
 return {date,time_kst:hhmm,gate_decision:sourceGate,targets,
  automatic_broker_retry_allowed:false,historical_backfill_allowed:false,
  investment_return_available:false,
  warnings:[
   "이 보고서는 저장 데이터에 근거한 복구 가능성 진단이며 브로커 API·저장소·systemd 변경을 수행하지 않습니다.",
   "현재 날짜만 수집 후보이며 과거 날짜는 오늘의 시세로 대체하지 않습니다.",
   "인증·호출한도·네트워크·파일 무결성 실패 원인은 각각 운영 로그와 별도로 확인해야 합니다.",
   "수동 복구를 승인하더라도 이미 생성된 파일은 덮어쓰지 않아야 합니다."
  ]};
}
export async function recoveryReadiness(){
 const gate=await dailyCaptureGate();
 const [holdings,nav]=await Promise.all([listSnapshots(),listNavCandidates()]);
 if(!gate.date)return {decision:"INVALID_CLOCK",automatic_retry_allowed:false};
 const hhmm=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
 return formulateRecoveryPlan(holdings.map(x=>x.date),nav.map(x=>x.date),
  gate.date,hhmm,gate.decision);
}

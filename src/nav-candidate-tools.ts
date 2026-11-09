import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { captureNavCandidate, navCandidateHistory } from "./nav-candidate.js";
import { transferReviewQueue } from "./transfer-queue.js";
import {liveNavCompositionAudit} from "./nav-composition.js";
import {navAccountingTrend} from "./nav-accounting-trend.js";
import {liveEvidenceCheck} from "./evidence-check.js";
import {navAnomalyReport} from "./nav-anomaly.js";
import {captureIntegrityReport} from "./capture-integrity.js";
import {dailyCaptureGate} from "./daily-capture-gate.js";

const ok=(o:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(o)}]});
const fail=(e:unknown)=>({isError:true,content:[{type:"text" as const,text:String(e instanceof Error?e.message:e)}]});
export function registerNavCandidateTools(server:McpServer,config:Config):void {
  server.tool("portfolio_daily_capture_gate",
    "매일 20:50 KST 이후 보유증권/NAV 스냅샷의 수집 여부·시각 차이·회계 불일치를 확인하는 읽기 전용 검증. 수익률·실거래·소급적재·증권사 자동 조회 없음.",
    {},async()=>{try{return ok(await dailyCaptureGate());}catch(e){return fail(e);}});
  server.tool("portfolio_capture_integrity",
    "보유주식과 NAV 후보 날짜별 파일의 존재·동일날짜 비교 가능 여부·수집 예정시각 전후·기간 공백을 점검합니다. API 호출 없이 저장소를 읽으며 과거 데이터를 현재 평가액으로 소급 채우지 않습니다.",
    {},async()=>{try{return ok(await captureIntegrityReport());}catch(e){return fail(e);}});
  server.tool("portfolio_nav_anomaly_report",
    "기존 NAV 후보·보유증권 스냅샷을 조회하여 수집 누락, 항목합계 불일치, 담보 잔차, 연속 날짜 간 큰 변화를 감지합니다. 외부 API 호출·주문·알림 발송 없이 읽기 전용. 후보 평가액 변화는 투자수익률이 아닙니다.",
    {month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("조회 월 YYYY-MM (미입력 전체)")},
    async({month})=>{try{return ok(await navAnomalyReport(month));}catch(e){return fail(e);}});
  server.tool("portfolio_transfer_evidence_check",
    "이체입금/출금 후보를 별도 은행·증권사 증빙의 날짜·금액·통화·이체 방향과 비교합니다. 개인정보 입력 없이 메타데이터만 받으며 증거 원본을 직접 확인하지 못하면 외부 납입 확정·수익률 자동 계산은 하지 않습니다.",
    {
      month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      case_id:z.string().regex(/^[0-9a-f]{16}$/),
      evidence_kind:z.enum(["bank_statement","broker_statement","personal_note"]),
      external_record_date:z.string().regex(/^\d{8}$/),
      external_record_amount:z.number().positive().finite(),
      external_record_currency:z.enum(["KRW","USD","JPY","EUR","OTHER","UNKNOWN"]),
      origin_account_relation:z.enum(["own_external_cash_account","own_investment_account","third_party","unknown"]),
      source_movement_direction:z.enum(["out","in","unknown"]),
      independently_reviewed:z.boolean()
    },
    async({month,...e})=>{try{return ok(await liveEvidenceCheck(config,month,e));}catch(err){return fail(err);}});

  server.tool("portfolio_nav_accounting_trend",
    "기록된 NH 순자산 후보의 날짜별 개별항목 합계 차이와 외화담보금액 잔차를 동일일자 기준으로 대조합니다. 기존 상세 기록이 없는 일자는 결측으로 표시하며, 수익률·회계공식은 확정하지 않습니다. 증권사 API를 호출하지 않습니다.",
    {month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("조회 월 YYYY-MM (생략하면 전체)")},
    async({month})=>{try{return ok(await navAccountingTrend(month));}catch(e){return fail(e);}});
  server.tool("portfolio_nav_composition_audit",
    "NH 통합 자산 원본의 항목별 그룹 합계와 외화예수금·증거금·주문가능액을 비교하고 금액 차이의 근접성만 진단합니다. 회계 규칙 미확정 시 순자산을 보정하지 않으며 실거래 없음.",
    {},async()=>{try{return ok(await liveNavCompositionAudit(config));}catch(e){return fail(e);}});
  server.tool("portfolio_capture_nav_candidate",
    "NH 통합 자산현황의 모든 연속 페이지를 수집해 오늘의 '순자산 후보'를 비공개 파일에 한 번만 기록합니다. 전체 수익률 계산용 검증 NAV가 아니며, 이미 저장된 날은 증권사 API를 재호출하지 않습니다. 실거래 없음.",
    {},async()=>{try{return ok(await captureNavCandidate(config));}catch(e){return fail(e);}});
  server.tool("portfolio_nav_candidate_history",
    "현금 포함 순자산에 대한 NH API 후보 기록을 조회합니다. 미검증 후보이며 월별 수익률, 투자원금이나 전체 순자산 확정값을 의미하지 않습니다.",
    {month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("선택적 YYYY-MM")},
    async({month})=>{try{return ok(await navCandidateHistory(month));}catch(e){return fail(e);}});
  server.tool("portfolio_transfer_review_queue",
    "NH 공통 거래원장에서 외부 납입·인출 여부가 아직 확인되지 않은 이체 후보를 검토 목록으로 보여줍니다. 별도 은행/출처 증거 없이는 확정하지 않으며 개인정보·계좌번호 미반환.",
    {month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("조회 월 YYYY-MM")},
    async({month})=>{try{return ok(await transferReviewQueue(config,month));}catch(e){return fail(e);}});
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { captureNavCandidate, navCandidateHistory } from "./nav-candidate.js";
import { transferReviewQueue } from "./transfer-queue.js";
import {liveNavCompositionAudit} from "./nav-composition.js";

const ok=(o:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(o)}]});
const fail=(e:unknown)=>({isError:true,content:[{type:"text" as const,text:String(e instanceof Error?e.message:e)}]});
export function registerNavCandidateTools(server:McpServer,config:Config):void {
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

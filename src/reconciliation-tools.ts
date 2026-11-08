import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { monthDates } from "./history.js";
import { liveNetAssetAudit, liveExternalFlowAudit, returnReadiness } from "./reconciliation.js";

const ok=(o:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(o)}]});
const fail=(e:unknown)=>({isError:true,content:[{type:"text" as const,text:String(e instanceof Error?e.message:e)}]});
export function registerReconciliationTools(server:McpServer,config:Config):void {
 server.tool("portfolio_net_asset_audit",
  "NH 통합 자산현황(국내+해외), 국내 잔고, 해외 잔고를 교차 대조하며 중복합산·현금·미결제·대출·연속조회 누락을 진단합니다. 전체 순자산은 검증 불완전 시 null. 조회 전용, API 3회 순차 호출.",
  {},async()=>{try{return ok(await liveNetAssetAudit(config));}catch(e){return fail(e);}});
 server.tool("portfolio_external_flow_audit",
  "한 달 해외주식 거래내역에서 내부 매수·매도·배당과 외부 입출금 후보를 구분합니다. 국내외 전체 현금원장을 제공하지 않아 최종 외부 현금흐름은 검증 불가로 명시합니다.",
  {month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("월 YYYY-MM")},
  async ({month})=>{try{return ok(await liveExternalFlowAudit(config,month,monthDates));}catch(e){return fail(e);}});
 server.tool("portfolio_return_readiness",
  "일별 스냅샷·외부현금흐름·전체 순자산의 정확한 수익률 산출 가능 여부와 누락 증거를 조회합니다. 증권사 API를 호출하지 않습니다.",
  {},async()=>{try{return ok(await returnReadiness());}catch(e){return fail(e);}});
}

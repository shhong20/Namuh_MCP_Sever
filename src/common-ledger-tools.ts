import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import type {Config} from "./config.js";
import {monthlyCommonLedger} from "./common-ledger.js";

export function registerCommonLedgerTools(server:McpServer,config:Config):void{
  server.tool("portfolio_common_cashflow_audit",
    "NH 공식 공통_계좌 입출금내역과 종합거래내역 API를 실제 조회해 외부 현금흐름의 후보를 대조합니다. 입출금은 외부 납입/인출과 동일하지 않을 수 있어 전체 수익률에 자동 반영하지 않습니다. 개인정보는 표시하지 않고 거래/환전은 실행하지 않습니다.",
    {month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("조회 월 YYYY-MM")},
    async({month})=>{
      try{
        return {content:[{type:"text" as const,text:JSON.stringify(await monthlyCommonLedger(config,month))}]};
      }catch(e){
        return {isError:true,content:[{type:"text" as const,text:"공통 거래원장 조회 실패: "+String(e instanceof Error?e.message:e)}]};
      }
    });
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { monthlyPerformance, annualDividendSummary, modifiedDietz } from "./performance.js";

function success(o:unknown){return {content:[{type:"text" as const,text:JSON.stringify(o)}]};}
function fail(e:unknown){return {isError:true,content:[{type:"text" as const,text:String(e instanceof Error?e.message:e)}]};}

const monthSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("조회 월 YYYY-MM");

export function registerPerformanceTools(server:McpServer,config:Config):void{
  server.tool("portfolio_monthly_performance",
    "월별 국내 실현손익(원화), 미국주식 실현손익(USD), 해외 실제 배당 입금 및 매수·매도 거래 건수를 통화별로 조회합니다. 전체 계좌의 진짜 수익률은 전 기간 순자산/외부 입출금이 완비되지 않으면 null로 명시하며, 주문·환전하지 않습니다.",
    {month:monthSchema},
    async ({month})=>{try{return success(await monthlyPerformance(config,month));}catch(e){return fail(e);}}
  );
  server.tool("portfolio_annual_dividends",
    "해당 연도 미국주식 배당 실제 입금 내역(종목/월/통화별 누적)을 보고합니다. 증권사 거래내역 응답의 페이지네이션이 완료되지 않았으면 완전한 연간 배당이라고 주장하지 않습니다.",
    {year:z.number().int().min(2000).max(2100)},
    async ({year})=>{try{return success(await annualDividendSummary(config,year));}catch(e){return fail(e);}}
  );
  server.tool("portfolio_return_estimate",
    "전체 계좌 순자산(예수금 포함)의 기초/기말 값과 외부 입출금이 완전히 확인된 경우에만 Modified Dietz 기간 수익률 근사값을 계산합니다. 매수·매도와 배당은 외부 현금흐름이 아니며, 확인되지 않은 데이터로는 수익률을 산출하지 않습니다.",
    {
      opening_nav_krw:z.number().finite().nonnegative(),
      closing_nav_krw:z.number().finite().nonnegative(),
      total_days:z.number().int().positive().max(3660),
      flows:z.array(z.object({
        day_offset:z.number().int().nonnegative(),
        external_flow_krw:z.number().finite()
      })).max(1000),
      verified_full_account_nav:z.boolean(),
      complete_external_flows:z.boolean()
    },
    async (input)=>{try{return success(modifiedDietz(input));}catch(e){return fail(e);}}
  );
}

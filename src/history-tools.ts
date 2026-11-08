import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { callRest } from "./client.js";
import { captureDaily, listSnapshots, summarizeHistory, monthDates, summarizeDividends, liveAccount } from "./history.js";

function result(v:unknown){return {content:[{type:"text" as const,text:JSON.stringify(v)}]};}
function error(e:unknown){return {isError:true,content:[{type:"text" as const,text:String(e instanceof Error?e.message:e)}]};}
export function registerHistoryTools(server:McpServer,config:Config):void{
  server.tool("portfolio_capture_snapshot",
    "국내·미국 보유증권의 현재 평가액과 종목별 수량·손익을 개인 WSL의 비공개 파일에 하루 한 번 저장합니다. 중복 일자에는 증권사 API를 호출하지 않고 기존 기록을 유지합니다. 거래/환전 없음.",
    {},async()=>{try{return result(await captureDaily(config));}catch(e){return error(e);}});
  server.tool("portfolio_history",
    "지금까지 저장된 국내·미국 증권 평가액의 일별 시계열과 월간 증감액을 보여줍니다. 증감액은 입출금 등이 반영되지 않은 평가액 차이로, 투자수익률과 다릅니다.",
    {month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("선택 월 YYYY-MM. 생략 시 모든 기록")},async({month})=>{
      try{return result(summarizeHistory(await listSnapshots(month),month));}catch(e){return error(e);}
    });
  server.tool("portfolio_dividend_report",
    "해외주식의 특정 월 실제 배당 입금 내역을 통화별·종목별로 요약합니다. 증권사 거래내역 API를 호출하며 주문/환전 없음. 거래내역 조회 범위와 페이지네이션 한계에 주의합니다.",
    {month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("배당 조회 월 YYYY-MM")},async({month})=>{
      try{
        const {start,end}=monthDates(month);
        const today=new Date();
        const current=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(today).replaceAll("-","");
        if(start>current)throw new Error("미래 월은 조회할 수 없습니다");
        const account=await liveAccount(config);
        const data=await callRest(config,"/gbstock/inquiry/v1/dailyTransaction",{
          act_no:account,iqr_sta_dt:start,iqr_end_dt:end>current?current:end,
          act_trd_cfc_cd:"00",iem_mlf_cd:"00001"
        });
        if(!["00166","13578"].includes(data.rsp_cd))throw new Error("거래내역 조회 실패: "+String(data.rsp_msg??data.rsp_cd));
        const transactions=Array.isArray(data.Output_0)?data.Output_0:[];
        return result({
          month,broker_result:data.rsp_cd,
          dividends:summarizeDividends(transactions),
          observed_transaction_rows:transactions.length,
          incomplete_if_continuation:true,
          warning:"해외주식 입금 거래만 요약합니다. 원화 환산 총배당을 추정하지 않으며 국내주식 배당과 기간별 원금 변동은 포함하지 않습니다."
        });
      }catch(e){return error(e);}
    });
}

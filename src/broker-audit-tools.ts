import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import type {Config} from "./config.js";
import {callRest,callRestPage} from "./client.js";
import {liveAccount} from "./history.js";
import {auditMonthlyBrokerEvidence,summarizeAnnualEvidence,quoteCrosscheck} from "./broker-audit.js";

const ok=(value:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(value)}]});
const error=(e:unknown)=>({isError:true,content:[{type:"text" as const,text:"Read-only audit failed: "+String(e instanceof Error?e.message:e)}]});
const kstToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replaceAll("-","");

export function registerBrokerAuditTools(server:McpServer,config:Config):void{
 server.tool("portfolio_us_monthly_ledger_audit",
 "미국주식 기간손익 API를 지정 월 1개월만 조회합니다. 여러 달 연속 호출을 방지하고 연간 거래원장·원화 세금 공제액을 확정하지 않는 읽기전용 진단입니다.",
 {year:z.number().int().min(2000).max(2100),month:z.number().int().min(1).max(12)},async({year,month})=>{
  try{
   const today=kstToday(),currentYear=Number(today.slice(0,4));
   if(year>currentYear)throw new Error("FUTURE_YEAR");
   const monthText=String(month).padStart(2,"0");
   const start=String(year)+monthText+"01";
   if(start>today)throw new Error("FUTURE_MONTH");
   const account=await liveAccount(config);
   const monthEnd=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10).replaceAll("-","");
   const end=monthEnd>today?today:monthEnd;
   const body={act_no:account,iqr_dit:"2",sta_orr_dt:start,end_orr_dt:end,
     fc_sec_trd_nat_cd:"200",trd_cur_cd:"KRW"};
   const audit=await auditMonthlyBrokerEvidence(
     String(year)+"-"+monthText,
     (cts,flag)=>callRestPage(config,"/gbstock/inquiry/v1/periodPnl",body,cts,flag),
     8
   );
   return ok({
     ...summarizeAnnualEvidence(year,[audit]),
     mode:"READ_ONLY_SINGLE_MONTH_BROKER_EVIDENCE_AUDIT",
     requested_month:audit.month,
     requested_period:{start,end},
     full_year_coverage:false,
     request_limited_to_one_month:true
   });
  }catch(e){return error(e);}
 });
 server.tool("portfolio_kr_zero_valuation_quote_audit",
 "국내 보유증권의 0원 평가/양수 보유수량 이상값을 별도 종목 시세 API로 교차검사합니다. 참고 평가액만 제공하며 잔고를 보정하거나 거래하지 않습니다.",
 {},async()=>{
  try{
   const account=await liveAccount(config);
   const balance=await callRest(config,"/krstock/inquiry/v1/balance",{
     act_no:account,bnc_bse_cd:"5",ltg_aot_dit_cd:"9",aet_bse:"1",qut_dit_cd:"UNT",aly_qut_cd:"2"
   });
   if(!["00166","13578"].includes(String(balance.rsp_cd))||!Array.isArray(balance.Output_1))
     throw new Error("BROKER_BALANCE_NOT_VERIFIED");
   const anomalies=balance.Output_1.filter((r:any)=>Number(r.itg_bnc_qty)>0&&Number(r.eal_amt)===0);
   if(anomalies.length>20)throw new Error("TOO_MANY_ANOMALIES");
   const audited=[];
   for(const row of anomalies){
     try{
      const data=await callRest(config,"/krstock/quote/v1/currentPrice",{iem_cd:row.iem_cd,market_cd:"KRX"});
      const q=data.Output_0||{};
      audited.push(quoteCrosscheck({
        symbol:String(row.iem_cd??""),quantity:Number(row.itg_bnc_qty),
        broker_market_value_krw:Number(row.eal_amt),last_price_krw:q.stck_prpr,
        quote_code:String(data.rsp_cd),
        quote_timestamp:typeof q.hoga_bsop_hour==="string"?q.hoga_bsop_hour:null
      }));
     }catch{
      audited.push({ok:false,symbol:String(row.iem_cd??""),reason:"QUOTE_FETCH_FAILED"});
     }
   }
   return ok({
    mode:"READ_ONLY_QUOTE_CROSSCHECK",anomaly_count:anomalies.length,anomalies:audited,
    broker_values_corrected:false,orders_submitted:false,
    warning:"The quote may be delayed and does not replace tax basis or broker book valuation; other broker balance errors may be undetected."
   });
  }catch(e){return error(e);}
 });
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { callRest } from "./client.js";
import { liveAccount } from "./history.js";
import { summarizeBalances } from "./portfolio.js";
import { classifyTaxReadiness, classifyDailyCandle, quoteRateLimitReached } from "./tax-safety.js";

const success=(v:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(v)}]});
const failure=(e:unknown)=>({isError:true,content:[{type:"text" as const,text:"조회 실패: "+String(e instanceof Error?e.message:e)}]});
const kstDay=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replaceAll("-","");
async function holdings(config:Config,account:string){
 const d=await callRest(config,"/gbstock/inquiry/v1/balance",{
  act_no:account,qut_iqr_dit_cd:"9",fc_sec_trd_nat_cd:"200",cur_cd:"KRW",xns_dit_cd:"1"
 });
 if(!["00166","13578"].includes(String(d.rsp_cd))||!Array.isArray(d.Output_1))throw new Error("미국주식 잔고 조회 검증 실패");
 return summarizeBalances({Output_0:{},Output_1:[]},d).positions.filter(x=>x.market==="US");
}

export function registerTaxSafetyTools(server:McpServer,config:Config):void {
 server.tool("portfolio_us_tax_readiness",
  "해외주식 보유 평가이익/평가손실과 과세상 실현 양도차익을 구별하는 읽기전용 연말 세금검토 도구. 연간 거래원장·환율·타 증권사 완전 확인 전에는 250만원 기본공제 잔여액을 절대 계산하지 않습니다. 주문·환전 없음.",
  {year:z.number().int().min(2000).max(2100)},async ({year})=>{
   try{
    const today=kstDay();
    if(year>Number(today.slice(0,4)))throw new Error("미래 연도 조회 금지");
    const account=await liveAccount(config);
    const positions=await holdings(config,account);
    const end=String(year)+"1231";
    const annual=await callRest(config,"/gbstock/inquiry/v1/periodPnl",{
     act_no:account,iqr_dit:"2",sta_orr_dt:String(year)+"0101",
     end_orr_dt:end<today?end:today,fc_sec_trd_nat_cd:"200",trd_cur_cd:"KRW"
    });
    return success(classifyTaxReadiness(positions,annual,year));
   }catch(e){return failure(e);}
  });
 server.tool("portfolio_us_daily_candles",
  "미국주식 지정 거래일 일봉을 양봉/음봉/도지/미확인으로 분류. API 호출 제한을 위해 최대 3종목씩 나누어 조회하고 호출량 초과시 즉시 중단합니다. 주문 없음.",
  {date:z.string().regex(/^\d{8}$/),offset:z.number().int().min(0).max(29).default(0),limit:z.number().int().min(1).max(3).default(3)},async ({date,offset,limit})=>{
   try{
    if(date>kstDay())throw new Error("미래 거래일 조회 금지");
    const account=await liveAccount(config);
    const positions=(await holdings(config,account)).filter(x=>x.quantity>0);
    if(positions.length>30)throw new Error("한 번에 최대 30종목");
    const rows=[];
    const page=positions.slice(offset,offset+limit);
    let rateLimitReached=false;
    for(const p of page){
     let candle:any;
     try{
      const d=await callRest(config,"/gbstock/quote/v1/period",{
       iem_cd:p.symbol,end_dt:date,count:"0002",maxavg:"005",
       gubun:"3",xtick:"0001",today_cls:"0",market_cls:"1"
      });
      if(quoteRateLimitReached(d)){rateLimitReached=true;}
      candle=d.rsp_cd==="00000"?classifyDailyCandle(p.symbol,d.Output_1??[],date):{
       symbol:p.symbol,status:"BROKER_QUOTE_UNAVAILABLE",candle_date:null};
     }catch(e){
      if(quoteRateLimitReached(e))rateLimitReached=true;
      candle={symbol:p.symbol,status:"BROKER_QUOTE_UNAVAILABLE",candle_date:null};
     }
     rows.push({...candle,name:p.name,quantity:p.quantity,
      unrealized_pnl_krw:p.unrealized_pnl_krw,
      unrealized_gain_status:p.unrealized_pnl_krw>0?"GAIN":p.unrealized_pnl_krw<0?"LOSS":"FLAT"});
     if(rateLimitReached)break;
    }
    return success({date,mode:"READ_ONLY_PAGED_DAILY_CANDLE_SCREEN",rows,
     total_us_holdings:positions.length,offset,requested_limit:limit,
     attempted_count:rows.length,rate_limited:rateLimitReached,
     next_offset:rateLimitReached?null:(offset+rows.length<positions.length?offset+rows.length:null),
     full_holdings_coverage:!rateLimitReached&&offset===0&&rows.length===positions.length,
     all_candles_verified:rows.every(r=>["BULLISH","BEARISH","DOJI"].includes(r.status)),
     orders_submitted:false,
     note:"양봉은 시가 대비 종가가 오른 경우이며 보유 평가이익이나 실현 양도차익과 다릅니다."});
   }catch(e){return failure(e);}
  });
}

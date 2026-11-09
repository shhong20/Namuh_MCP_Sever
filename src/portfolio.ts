import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { callRest } from "./client.js";
import { analyzeRecentUsFills } from "./recent-buys.js";

type JsonObject = Record<string, any>;

export function numberOf(value: unknown): number {
  const n = Number(value);
  return value === "" || value === null || value === undefined || !Number.isFinite(n) ? 0 : n;
}

export function summarizeBalances(domestic: JsonObject, overseas: JsonObject) {
  const kor = Array.isArray(domestic.Output_1) ? domestic.Output_1 : [];
  const foreign = Array.isArray(overseas.Output_1) ? overseas.Output_1 : [];
  const positions = [
    ...kor.map((r: JsonObject) => ({
      market: "KR", symbol: String(r.iem_cd ?? ""), name: String(r.iem_nm ?? ""),
      quantity: numberOf(r.itg_bnc_qty), market_value_krw: numberOf(r.eal_amt),
      unrealized_pnl_krw: numberOf(r.eal_pls_amt), return_pct: numberOf(r.pft_rt),
      valuation_currency: "KRW",
    })),
    ...foreign.map((r: JsonObject) => ({
      market: "US", symbol: String(r.iem_cd ?? ""), name: String(r.iem_nm ?? ""),
      quantity: numberOf(r.cns_bse_bnc_qty),
      market_value_krw: numberOf(r.krw_eal_amt),
      unrealized_pnl_krw: numberOf(r.krw_eal_pls_amt),
      return_pct: numberOf(r.eal_pft_rt1),
      valuation_currency: "KRW",
      market_value_usd: numberOf(r.fc_eal_amt),
      unrealized_pnl_usd: numberOf(r.fc_eal_pls_amt),
      valuation_fx_krw_per_usd: numberOf(r.tdt_sby_bse_xcg_rt),
    })),
  ];
  const posVal = (market: string) => positions.filter(p => p.market === market).reduce((s, p) => s + p.market_value_krw, 0);
  const totalValue = posVal("KR") + posVal("US");
  const domesticValue = posVal("KR"), foreignValue = posVal("US");
  const pnl = positions.reduce((s, p) => s + p.unrealized_pnl_krw, 0);
  const pnlByAccount = numberOf(domestic.Output_0?.tot_eal_pls) + numberOf(overseas.Output_0?.eal_pls_sum_amt);
  const concentration = positions.map(p => ({
    market: p.market, symbol: p.symbol, name: p.name,
    weight_pct: totalValue > 0 ? Math.round(p.market_value_krw / totalValue * 10000) / 100 : 0,
    market_value_krw: p.market_value_krw,
  })).sort((a,b) => b.weight_pct-a.weight_pct);
  const semiconductor = positions.filter(p => /하이닉스|삼성전자|TSM|TSMC|INTC|인텔|NVIDIA|엔비디아/i.test(p.name+" "+p.symbol));
  const semiconductorValue = semiconductor.reduce((s,p)=>s+p.market_value_krw,0);
  const leveraged = positions.filter(p => /레버리지|2X|3X|SOXL|TQQQ/i.test(p.name+" "+p.symbol));
  const leveragedValue = leveraged.reduce((s,p)=>s+p.market_value_krw,0);
  const fx = foreign.map((r: JsonObject) => {
    const usdCost = numberOf(r.fc_abk_amt);
    const usdValue = numberOf(r.fc_eal_amt);
    const fxRate = numberOf(r.tdt_sby_bse_xcg_rt);
    const krwCost = numberOf(r.krw_abk_amt1);
    const reported = numberOf(r.krw_eal_pls_amt);
    if (!(fxRate > 0 && usdCost > 0)) return null;
    const priceEffect = (usdValue-usdCost)*fxRate;
    const exchangeEffect = usdCost*fxRate-krwCost;
    return { symbol:String(r.iem_cd ?? ""),
      stock_effect_krw:Math.round(priceEffect),
      fx_effect_krw:Math.round(exchangeEffect),
      residual_krw:Math.round(reported-priceEffect-exchangeEffect),
      reported_pnl_krw:reported };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  const fxTotals = fx.reduce((s,x)=>({
    stock_effect_krw:s.stock_effect_krw+x.stock_effect_krw,
    fx_effect_krw:s.fx_effect_krw+x.fx_effect_krw,
    residual_krw:s.residual_krw+x.residual_krw,
    reported_pnl_krw:s.reported_pnl_krw+x.reported_pnl_krw,
  }),{stock_effect_krw:0,fx_effect_krw:0,residual_krw:0,reported_pnl_krw:0});
  return {
    currency:"KRW", scope:"domestic_KR_and_overseas_US_securities_only",
    warning:"포지션 평가액 합계이며 예수금/미결제금액/대출/다른 국가 자산은 포함하지 않습니다. 전체 순자산과 다릅니다.",
    market_value_krw:totalValue, domestic_securities_krw:domesticValue,
    us_securities_krw:foreignValue, position_unrealized_pnl_krw:pnl,
    account_reported_unrealized_pnl_krw:pnlByAccount,
    account_reported_values_not_added_to_positions:true,
    positions, weights:concentration,
    risk: {
      largest_position:concentration[0]??null,
      top_3_weight_pct:concentration.slice(0,3).reduce((s,p)=>s+p.weight_pct,0),
      semiconductor_exposure_pct:totalValue>0?Math.round(semiconductorValue/totalValue*10000)/100:0,
      semiconductor_estimation_note:"주요 반도체 종목명에 기반한 휴리스틱 분석이며 ETF 구성종목 중복·기타 반도체주는 누락될 수 있음",
      explicit_leveraged_position_pct:totalValue>0?Math.round(leveragedValue/totalValue*10000)/100:0,
      explicit_leveraged_positions:leveraged.map(p=>({name:p.name,symbol:p.symbol,market_value_krw:p.market_value_krw})),
    },
    fx_attribution:{
      availability:fx.length===foreign.length?"all_us_positions":"partial",
      valuation_exchange_rate_note:"NH API가 제공하는 종목별 평가환율. 실시간 현물환율과 다를 수 있음",
      fee_rounding_residual_note:"잔차는 수수료뿐만 아니라 반올림·평가 조정 등을 포함할 수 있음",
      totals:fxTotals, positions:fx,
    },
  };
}

export function normalizeOrders(data: JsonObject) {
  const rows = Array.isArray(data.Output_0) ? data.Output_0 : [];
  return rows.map((r: JsonObject) => {
    const requested = numberOf(r.orr_qty), filled = numberOf(r.cns_qty);
    const cancelled = numberOf(r.can_qty);
    const remaining = numberOf(r.ny_cns_orr_qty);
    const state = cancelled >= requested && requested > 0 ? "cancelled"
      : filled >= requested && requested>0 ? "filled"
      : filled>0 ? "partial_fill"
      : remaining>0 ? "unfilled"
      : "unknown";
    return {symbol:r.tck_iem_cd??r.iem_cd, name:r.iem_nm,
      date:r.orr_dt, order_no:r.orr_no, side:r.sby_dit_nm,
      ordered_quantity:requested, filled_quantity:filled, cancelled_quantity:cancelled,
      unfilled_quantity:remaining, order_price_usd:numberOf(r.fc_orr_uit_pr),
      execution_price_usd:numberOf(r.cns_pr), status:state,
      broker_status:r.orr_sts_nm};
  });
}

export function normalizeDomesticOrders(data: JsonObject) {
  const rows = Array.isArray(data.Output_0) ? data.Output_0 : [];
  return rows.map((r:JsonObject)=>{
    const requested=numberOf(r.orr_qty), filled=numberOf(r.tot_cns_qty), cancelled=numberOf(r.can_qty), remaining=numberOf(r.ny_cns_qty);
    const state=cancelled>=requested&&requested>0?"cancelled"
      :filled>=requested&&requested>0?"filled"
      :filled>0?"partial_fill"
      :remaining>0?"unfilled":"unknown";
    return {symbol:String(r.iem_cd??""),name:r.iem_nm,order_no:r.itg_orr_no,
      side:r.sby_dit_cd_nm,market:r.orr_mkt_cd_nm,
      ordered_quantity:requested,filled_quantity:filled,cancelled_quantity:cancelled,
      unfilled_quantity:remaining,order_price_krw:numberOf(r.orr_pr),
      execution_price_krw:numberOf(r.cns_avg_uit_pr),status:state};
  });
}

export function savingsPlan(monthlyKrw:number, existingEmergencyKrw:number, monthlyEssentialsKrw:number) {
  const emergencyGoal=monthlyEssentialsKrw*3;
  const toGoal=Math.max(0,emergencyGoal-existingEmergencyKrw);
  const emergencyAllocation=Math.min(monthlyKrw,toGoal>0?monthlyKrw:0);
  return {
    monthly_budget_krw:monthlyKrw,
    emergency_fund_current_krw:existingEmergencyKrw,
    initial_emergency_goal_krw:emergencyGoal,
    monthly_emergency_allocation_krw:emergencyAllocation,
    monthly_investment_allocation_krw:monthlyKrw-emergencyAllocation,
    months_to_initial_goal:toGoal===0?0:Math.ceil(toGoal/monthlyKrw),
    note:"비상금 목표 3개월 필수생활비. 금융상품 추천이나 수익 예측이 아니며 생활비와 목표액에 따라 조정 필요.",
  };
}

export function registerPortfolioTools(server:McpServer, config:Config):void {
  async function liveAccount():Promise<string>{
    const data=await callRest(config,"/n2/acctinfo",{});
    const live=(data.Output_0??[]).filter((x:JsonObject)=>x.acct_type==="01");
    if(live.length!==1) throw new Error("실계좌 1개를 자동 식별할 수 없습니다. 별도 검증이 필요합니다.");
    return live[0].acct_no;
  }

  server.tool("portfolio_overview",
    "국내·미국 보유증권 평가액, 원화 기준 비중, 환율·주가 손익 및 집중도·레버리지 위험을 통합 분석합니다. 주문과 자금이동은 실행하지 않습니다. 예수금은 합산하지 않습니다.",
    {}, async ()=>{
      try{
        const account=await liveAccount();
        const domestic=await callRest(config,"/krstock/inquiry/v1/balance",{
          act_no:account,bnc_bse_cd:"5",ltg_aot_dit_cd:"9",aet_bse:"1",qut_dit_cd:"UNT",aly_qut_cd:"2"
        });
        const overseas=await callRest(config,"/gbstock/inquiry/v1/balance",{
          act_no:account,qut_iqr_dit_cd:"9",fc_sec_trd_nat_cd:"200",cur_cd:"KRW",xns_dit_cd:"1"
        });
        if(!["00166","13578"].includes(domestic.rsp_cd)||!["00166","13578"].includes(overseas.rsp_cd))
          throw new Error("잔고 조회 업무 결과를 확인할 수 없습니다: "+String(domestic.rsp_msg??"")+" / "+String(overseas.rsp_msg??""));
        return {content:[{type:"text" as const,text:JSON.stringify(summarizeBalances(domestic,overseas))}]};
      }catch(e){return {content:[{type:"text" as const,text:"통합 자산 조회 실패: "+String(e instanceof Error?e.message:e)}],isError:true};}
    });

  server.tool("portfolio_us_orders",
    "미국주식 특정 주문일의 매수·매도 접수·체결·미체결·취소 내역을 정규화하여 확인합니다. 날짜는 YYYYMMDD 형식이며 주문번호만 반환하고 계좌번호는 숨깁니다.",
    {date:z.string().regex(/^\d{8}$/).describe("미국주식 주문일 YYYYMMDD")},
    async ({date})=>{
      try{
        const account=await liveAccount();
        const data=await callRest(config,"/gbstock/inquiry/v1/unexecuted",{
          orr_dt:date,act_no:account,oss_sby_dit_cd:"0",sot_dit:"1",ost_cns_dit:"0"
        });
        if(data.rsp_cd!=="00166"&&data.rsp_cd!=="13578") throw new Error(String(data.rsp_msg??data.rsp_cd));
        return {content:[{type:"text" as const,text:JSON.stringify({
          date, broker_code:data.rsp_cd, orders:normalizeOrders(data),
          warning:"해당 주문일 조회 결과입니다. 이전·이후 거래일의 주문 및 장기 체결 이력 전체를 보장하지 않습니다."
        })}]};
      }catch(e){return {content:[{type:"text" as const,text:"주문 조회 실패: "+String(e instanceof Error?e.message:e)}],isError:true};}
    });

  server.tool("portfolio_kr_orders",
    "국내주식 특정 주문일의 체결·미체결·취소·부분체결을 조회하고 계좌정보를 제외한 결과를 반환합니다.",
    {date:z.string().regex(/^\d{8}$/).describe("국내주식 주문일 YYYYMMDD")},
    async ({date})=>{
      try{
        const account=await liveAccount();
        const data=await callRest(config,"/krstock/inquiry/v1/dailyOrderExecution",{
          orr_dt:date,act_no:account,orr_mkt_cd:"00",ost_cns_dit:"0"
        });
        if(!["00166","11512"].includes(data.rsp_cd))throw new Error(String(data.rsp_msg??data.rsp_cd));
        return {content:[{type:"text" as const,text:JSON.stringify({
          date,broker_code:data.rsp_cd,orders:normalizeDomesticOrders(data),
          warning:"요청한 주문일 조회 결과이며 전체 기간 체결 이력을 의미하지 않습니다."
        })}]};
      }catch(e){return {content:[{type:"text" as const,text:"국내 주문 조회 실패: "+String(e instanceof Error?e.message:e)}],isError:true};}
    });

  server.tool("portfolio_recent_us_buys",
    "미국주식 최근 1~7일 실제 매수 체결분과 현재 보유 평가단가를 비교합니다. 취소주문은 제외하고 과거 개별 매수 lot의 확정 손익으로 오인하지 않도록 명시합니다. 조회전용.",
    {start_date:z.string().regex(/^\d{8}$/),end_date:z.string().regex(/^\d{8}$/)},
    async ({start_date,end_date})=>{
      try {
        const parseDate=(s:string)=>{
          const v=new Date(s.slice(0,4)+"-"+s.slice(4,6)+"-"+s.slice(6,8)+"T00:00:00Z");
          if (!Number.isFinite(v.getTime())||v.toISOString().slice(0,10).replace(/-/g,"")!==s)throw new Error("Invalid date");
          return v;
        };
        const begin=parseDate(start_date),end=parseDate(end_date);
        const days=Math.round((end.getTime()-begin.getTime())/86400000)+1;
        if (days<1||days>7)throw new Error("Date range must be 1–7 days");
        const account=await liveAccount();
        const allOrders:ReturnType<typeof normalizeOrders>=[];
        const dates:string[]=[];
        for(let n=0;n<days;n++) {
          const d=new Date(begin.getTime()+86400000*n).toISOString().slice(0,10).replace(/-/g,"");
          const response=await callRest(config,"/gbstock/inquiry/v1/unexecuted",{
            orr_dt:d,act_no:account,oss_sby_dit_cd:"0",sot_dit:"1",ost_cns_dit:"0"
          });
          if(!["00166","13578"].includes(response.rsp_cd))throw new Error("US order source incomplete");
          allOrders.push(...normalizeOrders(response));dates.push(d);
        }
        const us=await callRest(config,"/gbstock/inquiry/v1/balance",{
          act_no:account,qut_iqr_dit_cd:"9",fc_sec_trd_nat_cd:"200",cur_cd:"KRW",xns_dit_cd:"1"
        });
        if(!["00166","13578"].includes(us.rsp_cd))throw new Error("US holdings source incomplete");
        if (!Array.isArray(us.Output_1)) throw new Error("US holdings rows missing");
        const positions=us.Output_1.map((p:JsonObject)=>({
          symbol:String(p.iem_cd??""),name:String(p.iem_nm??""),quantity:numberOf(p.cns_bse_bnc_qty),
          market_value_usd:numberOf(p.fc_eal_amt),market_value_krw:numberOf(p.krw_eal_amt),
          valuation_fx_krw_per_usd:numberOf(p.tdt_sby_bse_xcg_rt),
        }));
        const result=analyzeRecentUsFills(allOrders,positions,dates,true);
        return {content:[{type:"text" as const,text:JSON.stringify(result)}]};
      }catch(e){return {content:[{type:"text" as const,text:"최근 해외주식 매수 분석 실패: "+String(e instanceof Error?e.message:e)}],isError:true};}
    });

  server.tool("portfolio_savings_plan",
    "월 적립액과 비상금 목표(3개월 필수생활비)를 고려해 월 투자 가능 금액을 계산합니다. 주문은 하지 않습니다.",
    {monthly_krw:z.number().int().min(1000).max(100000000),
     emergency_krw:z.number().int().min(0).max(1000000000),
     essential_expenses_krw:z.number().int().min(1000).max(100000000)},
    async ({monthly_krw,emergency_krw,essential_expenses_krw})=>({
      content:[{type:"text" as const,text:JSON.stringify(savingsPlan(monthly_krw,emergency_krw,essential_expenses_krw))}]
    }));
}

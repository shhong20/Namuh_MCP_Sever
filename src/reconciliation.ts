import type { Config } from "./config.js";
import { callRest, callRestPage } from "./client.js";
import { collectBrokerPages } from "./pagination.js";
import { listNavCandidates } from "./nav-candidate.js";
import { liveAccount, currentSeoulDate, listSnapshots } from "./history.js";

type Raw = Record<string, any>;
const num=(x:unknown):number|null=>x===undefined||x===null||x===""||!Number.isFinite(Number(x))?null:Number(x);
const round=(x:number)=>Math.round(x);
export type AuditSource={operation:string;code:string;message:string;pagination_required:boolean;complete:boolean;row_count:number};
function source(op:string,data:Raw,accepted:string[]):AuditSource{
 const code=String(data?.rsp_cd??"unknown");
 return {operation:op,code,message:String(data?.rsp_msg??"").slice(0,120),
  pagination_required:code==="00218",complete:accepted.includes(code),
  row_count:Array.isArray(data?.Output_1)?data.Output_1.length:0};
}
export function reconcileAccountViews(asset:Raw,domestic:Raw,foreign:Raw){
 const assetSource=source("krstockInquiryAssetStatus",asset,["00166","11512"]);
 const domesticSource=source("krstockInquiryBalance",domestic,["00166","13578"]);
 const foreignSource=source("gbstockInquiryBalance",foreign,["00166","13578"]);
 const assetRows=Array.isArray(asset.Output_1)?asset.Output_1:[];
 const domesticRows=Array.isArray(domestic.Output_1)?domestic.Output_1:[];
 const foreignRows=Array.isArray(foreign.Output_1)?foreign.Output_1:[];
 const assetUsRows=assetRows.filter((r:Raw)=>/외화|해외/.test(String(r.iem_mlf_nm??"")));
 const assetKrRows=assetRows.filter((r:Raw)=>/^(주식|ETF|ETN)$/.test(String(r.iem_mlf_nm??"")));
 const assetUsValue=assetUsRows.reduce((n:number,r:Raw)=>n+(num(r.eal_amt)??0),0);
 const integratedRowSum=assetRows.reduce((n:number,r:Raw)=>n+(num(r.eal_amt)??0),0);
 const krPositions=domesticRows.reduce((n:number,r:Raw)=>n+(num(r.eal_amt)??0),0);
 const usPositions=foreignRows.reduce((n:number,r:Raw)=>n+(num(r.krw_eal_amt)??0),0);
 const asset0=asset.Output_0??{},kr0=domestic.Output_0??{},us0=foreign.Output_0??{};
 const factors={
   domestic_dca_krw:num(kr0.dca),
   domestic_broker_nas_krw:num(kr0.nas_amt),
   domestic_broker_total_assets_krw:num(kr0.tot_aet_amt),
   domestic_loan_krw:num(kr0.lon_amt),
   overseas_broker_total_assets_krw:num(us0.tot_aet_amt),
   overseas_cash_estimate_krw:num(us0.krw_dca),
   overseas_unsettled_estimate_krw:num(us0.krw_ny_stl_xcl_amt),
   integrated_fx_cash_estimate_krw:num(asset0.krw_tsl_fc_dca),
   integrated_fx_margin_estimate_krw:num(asset0.krw_tsl_fc_mgg_amt),
   integrated_broker_total_assets_krw:num(asset0.tot_aet_amt),
   integrated_broker_net_assets_krw:num(asset0.nas_amt),
   integrated_loan_krw:num(asset0.lon_amt),
 };
 const partial=assetSource.pagination_required || !assetSource.complete || !domesticSource.complete || !foreignSource.complete;
 const warnings=[
  "통합 자산현황에는 국내·해외 증권이 함께 포함됩니다. 통합 평가액과 국내/해외 잔고 평가액을 더하지 마세요.",
  "예수금, 주문가능금액, 미결제금액, 담보·증거금은 동일한 자산을 중복 표현할 수 있어 서로 더하지 않습니다.",
  "국내/해외 보유증권만 합산한 값은 총순자산이 아니며 투자수익률 산정의 기초금액으로 사용할 수 없습니다.",
 ];
 if(assetSource.pagination_required)warnings.push("증권사 통합 자산 API에서 연속조회 응답 00218 수신: 목록과 합계가 부분 결과이며 추가 페이지를 수집하지 않았습니다.");
 if(assetSource.complete && num(asset0.tot_aet_amt)!==null && Math.abs(integratedRowSum-Number(asset0.tot_aet_amt))>1)
  warnings.push("수집된 통합 종목별 평가액 합계가 증권사 총자산 요약과 일치하지 않습니다. 증거금·외화예수금·기타 중복 표시 가능성을 검증하기 전에는 합산 금액을 순자산으로 사용하지 마세요.");
 if(factors.integrated_broker_net_assets_krw===0 && assetRows.length>0)
  warnings.push("통합 순자산 요약이 0이지만 종목 목록은 존재하므로 0원을 유효한 순자산으로 간주하지 않습니다.");
 return {
   as_of_date:currentSeoulDate(),scope:"one_brokerage_live_account",
   sources:[assetSource,domesticSource,foreignSource],
   observed:{
     domestic_security_rows:domesticRows.length,us_security_rows:foreignRows.length,
     integrated_collected_rows:assetRows.length,
     integrated_collected_domestic_krw:round(assetKrRows.reduce((s:number,r:Raw)=>s+(num(r.eal_amt)??0),0)),
     integrated_collected_us_krw:round(assetUsValue),
     domestic_holdings_krw:round(krPositions),us_holdings_krw:round(usPositions),
     combined_securities_only_krw:round(krPositions+usPositions),
     integrated_page_includes_us_securities:assetUsRows.length>0,
   },
   broker_reported_fields_not_additive:factors,
   broker_reported_net_asset_candidate_krw:assetSource.complete && (num(asset0.nas_amt)??0)>0 ? num(asset0.nas_amt):null,
   integrated_row_sum_krw:round(integratedRowSum),
   integrated_rows_minus_reported_total_assets_krw:assetSource.complete && num(asset0.tot_aet_amt)!==null ? round(integratedRowSum-Number(asset0.tot_aet_amt)):null,
   verified_full_net_asset_krw:null,
   verified_external_flow_ledger:false,
   eligible_for_realized_portfolio_return:false,
   audit_status:partial?"INCOMPLETE_SOURCE_PAGINATION_OR_ERROR":"UNRECONCILED_ACCOUNTING",
   warnings,
 };
}

export function classifyExternalTransactions(rows:Raw[]){
 const observed=rows.map(r=>{
   const description=String(r.sps_cd_nm??"");
   const kind=/배당금입금/.test(description)?"internal_dividend":
     /증권매수/.test(description)?"internal_buy":
     /증권매도/.test(description)?"internal_sell":
     /(?:외부|타행)(?:이체|입금)/.test(description)?"possible_external_deposit":
     /(?:외부|타행)(?:이체|출금)/.test(description)?"possible_external_withdrawal":
     "unverified";
   return {date:String(r.trd_dt??""),type:kind,label:description,
     currency:String(r.cur_cd_nm??""),amount:num(r.fc_trd_amt),
     externally_verified:false};
 });
 const counts=Object.fromEntries(["internal_dividend","internal_buy","internal_sell","possible_external_deposit","possible_external_withdrawal","unverified"].map(k=>[k,observed.filter(x=>x.type===k).length]));
 return {counts,observed,
   complete_external_flow_ledger:false,
   verified_net_external_flow_krw:null,
   note:"거래 종류에 근거한 후보 분류입니다. 증권사 거래내역의 전용 외부 입출금 기록·전체 페이지·국내 현금 이동이 검증되지 않아 원화 외부 납입 합계를 산출하지 않습니다."};
}
export async function liveNetAssetAudit(config:Config){
 const act_no=await liveAccount(config);
 // Sequential, no loops or automatic 429 retries.
 const integratedPages=await collectBrokerPages((cts,ctsFlag)=>callRestPage(config,"/krstock/inquiry/v1/assetStatus",{
   act_no,eal_aly_cd:"2",aet_bse:"1",qut_dit_cd:"UNT",aly_qut_cd:"2"
 },cts,ctsFlag));
 const integrated=integratedPages.data;
 const domestic=await callRest(config,"/krstock/inquiry/v1/balance",{
   act_no,bnc_bse_cd:"5",ltg_aot_dit_cd:"9",aet_bse:"1",qut_dit_cd:"UNT",aly_qut_cd:"2"
 });
 const overseas=await callRest(config,"/gbstock/inquiry/v1/balance",{
   act_no,qut_iqr_dit_cd:"9",fc_sec_trd_nat_cd:"200",cur_cd:"KRW",xns_dit_cd:"1"
 });
 const result=reconcileAccountViews(integrated,domestic,overseas);
 return {
  ...result,
  integrated_pagination:integratedPages.audit,
  audit_status:!integratedPages.audit.complete?"INCOMPLETE_SOURCE_PAGINATION_OR_ERROR":result.audit_status,
  verified_full_net_asset_krw:null,
  eligible_for_realized_portfolio_return:false,
 };
}
export async function liveExternalFlowAudit(config:Config,month:string,monthDates:(month:string)=>{start:string;end:string}){
 const dates=monthDates(month);
 const today=currentSeoulDate().replaceAll("-","");
 if(dates.start>today)throw new Error("미래 월은 조회할 수 없습니다");
 const act_no=await liveAccount(config);
 const data=await callRest(config,"/gbstock/inquiry/v1/dailyTransaction",{
   act_no,iqr_sta_dt:dates.start,iqr_end_dt:dates.end>today?today:dates.end,
   act_trd_cfc_cd:"00",iem_mlf_cd:"00001"
 });
 if(!["00166","13578"].includes(String(data.rsp_cd)))
   throw new Error("해외주식 거래내역을 확인할 수 없습니다: "+String(data.rsp_cd));
 const result=classifyExternalTransactions(Array.isArray(data.Output_0)?data.Output_0:[]);
 return {month,broker_code:data.rsp_cd,pagination_confirmed_complete:false,...result};
}
export async function returnReadiness(){
 const snapshots=await listSnapshots();
 const navCandidates=await listNavCandidates();
 return {
   stored_holding_snapshots:snapshots.length,
   stored_broker_nav_candidates:navCandidates.length,
   last_nav_candidate_date:navCandidates.at(-1)?.date??null,
   first_date:snapshots[0]?.date??null,
   last_date:snapshots[snapshots.length-1]?.date??null,
   verified_cash_inclusive_net_asset_snapshots:0,
   verified_external_flow_periods:0,
   actual_monthly_return_available:false,
   blockers:[
     "통합 자산 API 연속조회는 지원되지만 NH 순자산 후보의 항목 차이 및 회계 정의에 대한 검증",
     "예수금·미결제·대출이 포함된 계좌 전체 순자산의 일별 확정 저장",
     "국내외 입출금(외부 납입/인출) 전체 내역 및 연속조회 완결성",
     "연속된 기간 기초·기말 평가시점과 외부 현금흐름 금액 대조",
   ],
 };
}

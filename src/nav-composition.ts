import type {Config} from "./config.js";
import {liveAccount,currentSeoulDate} from "./history.js";
import {callRestPage} from "./client.js";
import {collectBrokerPages} from "./pagination.js";

type Row={iem_mlf_nm?:unknown;eal_amt?:unknown};
type Summary=Record<string,unknown>;
const numeric=(v:unknown):number|null=>v===null||v===undefined||v===""||!Number.isFinite(Number(v))?null:Number(v);
function rounded(v:number){return Math.round(v*100)/100;}
export function diagnoseNavComposition(summary:Summary,rows:Row[],page_complete:boolean) {
 const groups:Record<string,{count:number;value_krw:number}>={};
 let missing=0;
 for(const row of rows) {
   const amt=numeric(row.eal_amt);
   if(amt===null){missing++;continue;}
   const k=String(row.iem_mlf_nm||"UNCLASSIFIED");
   const group=groups[k]??{count:0,value_krw:0};
   group.count++;
   group.value_krw=rounded(group.value_krw+amt);
   groups[k]=group;
 }
 const brokerNav=numeric(summary.nas_amt),brokerAssets=numeric(summary.tot_aet_amt);
 const fxCash=numeric(summary.krw_tsl_fc_dca);
 const fxMargin=numeric(summary.krw_tsl_fc_mgg_amt);
 const fxOrderable=numeric(summary.krw_tsl_fc_orr_pbl_amt);
 const foreignCashRows=groups["외화예수금"]?.value_krw??null;
 const rowTotal=rounded(Object.values(groups).reduce((s,g)=>s+g.value_krw,0));
 const delta=brokerAssets===null?null:rounded(rowTotal-brokerAssets);
 const marginResidual=delta===null||fxMargin===null?null:rounded(delta-fxMargin);
 const orderableResidual=delta===null||foreignCashRows===null||fxOrderable===null?null:rounded(delta-(foreignCashRows-fxOrderable));
 const cashMarginOrderableResidual=fxCash===null||fxMargin===null||fxOrderable===null?null:rounded(fxCash-fxMargin-fxOrderable);
 const exact=page_complete && missing===0 && brokerNav!==null && brokerAssets!==null && brokerNav>0;
 return {
  date:currentSeoulDate(),source_pages_complete:page_complete,source_row_count:rows.length,
  group_values_krw:groups,unparseable_rows:missing,
  broker_reported:{net_assets_krw:brokerNav,total_assets_krw:brokerAssets,
    foreign_cash_krw:fxCash,foreign_margin_krw:fxMargin,foreign_orderable_krw:fxOrderable},
  comparisons:{
    sum_of_listed_items_krw:missing===0?rowTotal:null,
    listed_items_minus_broker_assets_krw:missing===0?delta:null,
    listed_delta_minus_margin_krw:missing===0?marginResidual:null,
    listed_delta_minus_cash_less_orderable_krw:missing===0?orderableResidual:null,
    foreign_cash_minus_margin_and_orderable_krw:cashMarginOrderableResidual,
    foreign_cash_group_minus_broker_cash_krw:foreignCashRows!==null&&fxCash!==null?rounded(foreignCashRows-fxCash):null
  },
  diagnostic_status:!exact?"INCOMPLETE_EVIDENCE":
    delta!==null&&Math.abs(delta)<=1?"LISTED_ITEMS_MATCH_BROKER_ASSETS":
    "DIFFERENCE_REQUIRES_ACCOUNTING_POLICY",
  verified_full_net_asset_krw:null,
  return_calculation_allowed:false,
  notes:[
   "개별 항목 합계와 증권사 요약의 차이가 외화 증거금 등에 가까워도 원인 확정 증거는 아닙니다.",
   "증거금·주문가능액·외화예수금은 일부 동일 자금을 나타낼 수 있으므로 상호 가감해서 순자산을 재구성하지 않습니다.",
   "이 진단은 NH 보고 요약을 검증된 순자산으로 승격시키지 않으며 투자수익률을 계산하지 않습니다."
  ]
 };
}
export async function liveNavCompositionAudit(config:Config){
 const act_no=await liveAccount(config);
 const r=await collectBrokerPages((cts,flag)=>callRestPage(config,"/krstock/inquiry/v1/assetStatus",{
  act_no,eal_aly_cd:"2",aet_bse:"1",qut_dit_cd:"UNT",aly_qut_cd:"2"
 },cts,flag),12);
 return {...diagnoseNavComposition(r.data.Output_0??{},r.data.Output_1,r.audit.complete),
   pagination:{complete:r.audit.complete,page_count:r.audit.page_count,
     response_codes:r.audit.codes,duplicates:r.audit.duplicate_rows,failure_reason:r.audit.failure_reason}};
}

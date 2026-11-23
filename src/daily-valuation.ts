/** Securities-value attribution is NOT a full-account return. Pure local snapshots only. */
import {listSnapshots} from "./history.js";
import {listNavCandidates} from "./nav-candidate.js";
type Hold=Awaited<ReturnType<typeof listSnapshots>>[number];
type Nav=Awaited<ReturnType<typeof listNavCandidates>>[number];
type Position=Hold["positions"][number];

function validatedPositions(s:Hold):Map<string,Position>|null{
  if(!Array.isArray(s.positions)||!Number.isFinite(s.holdings_value_krw)||s.holdings_value_krw<0)return null;
  const m=new Map<string,Position>();let sum=0;
  for(const p of s.positions){
    const k=p.market+":"+p.symbol;
    if(!/^(KR|US):[A-Za-z0-9.\-]{1,24}$/.test(k)||m.has(k)||
      !Number.isFinite(p.quantity)||p.quantity<0||
      !Number.isFinite(p.market_value_krw)||p.market_value_krw<0)return null;
    m.set(k,p);sum+=p.market_value_krw;
  }
  return Math.abs(sum-s.holdings_value_krw)<=1?m:null;
}
const calendarGap=(a:string,b:string)=>Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000);
export function summarizeDailyValuation(holdings:Hold[],navCandidates:Nav[]){
  const ordered=[...holdings].sort((a,b)=>a.date.localeCompare(b.date));
  const nav=new Map(navCandidates.map(n=>[n.date,n]));
  const seen=new Set<string>();const series:any[]=[];
  let prior:Hold|null=null;
  for(const day of ordered){
    if(seen.has(day.date))throw Error("DUPLICATE_SNAPSHOT_DATE");
    seen.add(day.date);
    const previous=prior?validatedPositions(prior):null;
    const current=validatedPositions(day);
    const gap=prior?calendarGap(prior.date,day.date):null;
    const valid=!!current&&(!prior||!!previous)&&(gap===null||gap>0);
    const stable:{market:string;symbol:string;name:string;value_change_krw:number;includes_fx:boolean}[]=[];
    const changed:string[]=[];
    if(previous&&current){
      for(const key of new Set([...previous.keys(),...current.keys()])){
        const a=previous.get(key),b=current.get(key);
        if(a&&b&&a.quantity===b.quantity&&a.quantity>0)
          stable.push({market:b.market,symbol:b.symbol,name:b.name,
            value_change_krw:b.market_value_krw-a.market_value_krw,includes_fx:b.market==="US"});
        else changed.push(key);
      }
    }
    const delta=valid&&prior?day.holdings_value_krw-prior.holdings_value_krw:null;
    const currentNav=nav.get(day.date),oldNav=prior?nav.get(prior.date):undefined;
    const navPaired=!!(currentNav&&oldNav);
    const blockers=["EXTERNAL_CASH_FLOW_LEDGER_NOT_VERIFIED","FULL_NET_ASSET_ACCOUNTING_NOT_VERIFIED"];
    if(!prior)blockers.push("NO_PRIOR_OBSERVATION");
    if(!valid)blockers.push("SNAPSHOT_POSITION_TOTAL_MISMATCH");
    if(prior&&gap!==1)blockers.push("OBSERVATION_NOT_NEXT_CALENDAR_DAY");
    const weekday=new Date(day.date+"T00:00:00Z").getUTCDay();
    if(weekday===0||weekday===6)blockers.push("WEEKEND_OBSERVATION_NOT_MARKET_RETURN");
    if(changed.length)blockers.push("POSITION_QUANTITY_CHANGED_OR_MISSING");
    if(!navPaired)blockers.push("NAV_CANDIDATE_MISSING_FOR_PAIR");
    if(navPaired&&[currentNav!,oldNav!].some(x=>x.reconciliation_status!=="ITEM_TOTAL_MATCHES"))
      blockers.push("NAV_LINE_ITEMS_RECONCILIATION_PENDING");
    series.push({
      date:day.date,previous_observation_date:prior?.date??null,calendar_gap_days:gap,
      captured_at:day.captured_at,securities_value_krw:day.holdings_value_krw,
      observation_on_weekend:weekday===0||weekday===6,
      exchange_session_calendar_verified:false,
      securities_valuation_change_krw:delta,
      unchanged_quantity_attributed_change_krw:delta!==null?stable.reduce((n,x)=>n+x.value_change_krw,0):null,
      all_positions_quantity_unchanged:!!(prior&&valid&&changed.length===0),
      quantity_changed_or_added_or_removed_symbols:changed,
      top_unchanged_quantity_contributors:prior&&valid
        ?stable.sort((a,b)=>Math.abs(b.value_change_krw)-Math.abs(a.value_change_krw)).slice(0,5):[],
      nav_candidate_paired:navPaired,
      broker_reported_nav_candidate_change_krw:navPaired
        ?currentNav!.reported_net_assets_krw-oldNav!.reported_net_assets_krw:null,
      verified_full_nav:false,verified_external_flows:false,
      actual_investment_profit_krw:null,actual_investment_return_pct:null,
      return_available:false,return_blockers:blockers,
    });
    prior=day;
  }
  return {
    broker:"NH",observations:ordered.length,series,
    full_account_investment_return_available:false,
    methodology:"OBSERVED_SECURITY_VALUATION_CHANGES_NOT_INVESTMENT_RETURN",
    note:"수량이 동일한 종목의 평가액 변화를 분리합니다. 미국종목에는 환율 영향이 포함되며, 수량이 달라진 종목은 가격 기여도 산정에서 제외합니다. NAV 후보/입출금 후보만으로 계좌 투자수익률을 확정하지 않습니다."
  };
}
export async function dailyValuationReport(month?:string){
  const [h,n]=await Promise.all([listSnapshots(month),listNavCandidates(month)]);
  return summarizeDailyValuation(h,n);
}

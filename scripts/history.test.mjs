import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSnapshot, currentSeoulDate, saveSnapshot, listSnapshots, summarizeHistory, summarizeDividends, monthDates } from "../dist/history.js";

function mockOverview(value=1000){
 return {market_value_krw:value,position_unrealized_pnl_krw:100,domestic_securities_krw:500,us_securities_krw:value-500,
 positions:[{market:"KR",symbol:"005930",name:"삼성전자",quantity:1,market_value_krw:500,unrealized_pnl_krw:100}]};
}
test("KST calendar day and months",()=>{
 assert.equal(currentSeoulDate(new Date("2026-11-08T15:30:00Z")),"2026-11-09");
 assert.deepEqual(monthDates("2026-02"),{start:"20260201",end:"20260228"});
 assert.deepEqual(monthDates("2024-02"),{start:"20240201",end:"20240229"});
 assert.throws(()=>monthDates("2026-13"));
});
test("atomic private snapshot and immutable same-date writes",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"namuh-snapshot-test-"));
 await (await import("node:fs/promises")).chmod(directory,0o700);
 process.env.NAMUH_PORTFOLIO_SNAPSHOT_DIR=directory;
 try {
  const first=createSnapshot(mockOverview(), "2026-11-08","2026-11-08T10:00:00Z");
  assert.equal((await saveSnapshot(first)).created,true);
  assert.equal((await saveSnapshot(createSnapshot(mockOverview(99999),"2026-11-08"))).created,false);
  const rows=await listSnapshots();
  assert.equal(rows.length,1);
  assert.equal(rows[0].holdings_value_krw,1000);
  assert.equal(JSON.stringify(rows[0]).includes("act_no"),false);
  const stat=await (await import("node:fs/promises")).stat(join(directory,"2026-11-08.json"));
  assert.equal(stat.mode & 0o777,0o600);
  await saveSnapshot(createSnapshot(mockOverview(1500),"2026-11-09"));
  const h=summarizeHistory(await listSnapshots());
  assert.equal(h.holdings_value_change_krw,500);
  assert.equal(h.holdings_value_change_pct,50);
  assert.equal(h.calculation_kind,"holdings_valuation_change_NOT_investment_return");
  assert.equal((await listSnapshots("2026-11")).length,2);
  assert.equal((await listSnapshots("2026-12")).length,0);
 }finally {
  delete process.env.NAMUH_PORTFOLIO_SNAPSHOT_DIR;
  await rm(directory,{recursive:true,force:true});
 }
});
test("dividend report separates symbols and currencies and ignores unrelated deposits",()=>{
 const x=summarizeDividends([
  {sps_cd_nm:"외화배당금입금",cur_cd_nm:"USD",fc_trd_amt:5.3,iem_cd:"KO",iem_krl_nm:"코카콜라"},
  {sps_cd_nm:"외화배당금입금",cur_cd_nm:"USD",fc_trd_amt:1.7,iem_cd:"KO"},
  {sps_cd_nm:"외화배당금입금",cur_cd_nm:"JPY",fc_trd_amt:120,iem_cd:"AAA"},
  {sps_cd_nm:"외화예수금입금",cur_cd_nm:"USD",fc_trd_amt:9999}
 ]);
 assert.equal(x.transaction_count,3);
 assert.equal(x.amounts_by_currency.USD,7);
 assert.equal(x.amounts_by_currency.JPY,120);
 assert.equal(x.by_symbol.length,2);
 assert.equal(x.by_symbol.find(r=>r.symbol==="KO").count,2);
});

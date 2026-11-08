# Namuh net-asset and investor-flow reconciliation — read-only

New MCP tools:

- `portfolio_net_asset_audit`: sequentially queries NH integrated `/krstock/inquiry/v1/assetStatus`, domestic holdings, US holdings. Returns source completeness, overlapping integrated domestic/US observations, cash, unsettled and loan fields **as non-additive reference amounts**, and audit blockers. Does not emit a fabricated full net asset value.
- `portfolio_external_flow_audit({month:"YYYY-MM"})`: audits one month of NH foreign-stock transactions; distinguishes dividend credits and security buys/sells from possible external transfers. It **never** claims complete whole-account contributions or withdrawals from this foreign securities transaction feed.
- `portfolio_return_readiness`: offline assessment of stored holdings-only snapshots and blockers for a verified actual investor return. Does not call NH.

## Findings from live NH PLUG read-only audit

On 2026-11-08, `krstockInquiryAssetStatus` returned **`rsp_cd=00218`** ("계속 조회시 다음(연속조회) 버튼을 누르시기 바랍니다.") together with an integrated `Output_1` page containing both Korean stocks and overseas equities. Its summary `tot_aet_amt` and `nas_amt` were zero even though rows contained nonzero securities positions.

Therefore:

- Integrated `Output_1` is a **partial page**, not a completed integrated NAV result.
- Combining the integrated holdings valuation with domestic and overseas holdings valuations double-counts positions.
- `dca`, `krw_tsl_fc_dca`, `krw_tsl_fc_mgg_amt`, `krw_ny_stl_xcl_amt`, broker `tot_aet_amt` and `nas_amt` are **not freely additive**. Settlements, collateral, cash equivalents, loans and country scope require documented reconciliation.
- No `verified_full_net_asset_krw` is returned until all source pages and components reconcile.
- The holding snapshots collected since 2026-11-08 remain unmodified; they are **securities-only snapshots**, not full NAV.
- `complete_external_flow_ledger` is false until all relevant domestic and foreign deposits/withdrawals, transfers and continuation pages can be verified.
- The Modified Dietz estimate tool still requires externally verified full account NAV and all external account flows. Automated actual monthly investor return remains unavailable, rather than fabricated.

On live transaction checks for 2026-06, a dividend credit and two overseas security purchases were safely classified as **internal** activity.

## Operational guardrails

- No brokerage account identifiers, app secrets or API tokens are returned in audit results.
- No new brokerage order, cancel, currency exchange or cash transfer operations are enabled; `enableTrading: false` stays hardcoded.
- Rate limits and unknown broker result codes are not silently retried or considered successful.
- All queries target the single authenticated live brokerage account. No changes to the existing daily 20:30 KST snapshot timer.
- Only per-source observations and explicit warnings are emitted, never a fabricated reconciled cash balance.

## Validation

```sh
npm run build
node --test scripts/portfolio.test.mjs scripts/history.test.mjs scripts/performance.test.mjs scripts/reconciliation.test.mjs
```

Further work: support broker-provided continuation tokens/headers for `00218`, verify all integrated asset rows and summary fields against the broker's official accounting definition, implement an authoritative full-ledger deposit/withdrawal source (currently not present in the available stock API catalog), reconcile cash-inclusive NAV across consecutive dates and only then enable broker-based automated monthly Modified Dietz reporting.

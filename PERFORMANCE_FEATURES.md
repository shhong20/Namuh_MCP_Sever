# Namuh portfolio monthly performance and cumulative dividend reporting

## Tools (read-only)

- `portfolio_monthly_performance({month:"YYYY-MM"})`: fetch domestic daily realized profit/loss (KRW), US realized PnL (USD), overseas dividends actually deposited, and the observed overseas transaction type breakdown. Returns `monthly_total_return_pct: null` unless the full net-asset and external cash-flow ledger is verified. The tool NEVER infers historical investor returns from the holdings-only snapshot series.
- `portfolio_annual_dividends({year:2026})`: overseas dividends actually recorded in the brokerage daily-transactions response; by ticker and month, grouped by source currency. **Partial first-page view only until API pagination is supported**. `complete:false` is intentional, not a promise of exhaustive annual reconciliation.
- `portfolio_return_estimate({...})`: Modified Dietz approximate return calculator using externally verified beginning/ending **whole-account net asset value including cash** plus a complete set of **external** account cash flows. It refuses calculation when either verified-completeness flag is false. This tool is not a brokerage-reconciled investment return.

## Critical financial correctness rules

1. The securities purchase/sale and a dividend paid *inside the brokerage account* are **not** external contribution/withdrawal. Only cash actually entering/leaving the portfolio from outside counts as an external investor flow.
2. Never combine realized PnL across USD and KRW without verified transaction-level exchange rates. The monthly report provides separate currencies.
3. Do not label holdings-only valuation change as TWR, MWR, Modified Dietz, true return, or net asset performance.
4. A return calculated via Modified Dietz is an **estimate**, even if the input flags are true. Precise time-weighted returns require valuations at each external cash-flow boundary.
5. The broker API may paginate results; `complete:false` and `report_complete:false` are deliberate until all pages are conclusively traversed and reconciled.
6. The October/November 2026 US transaction sample previously showed `fc_trd_amt` is the cash amount for foreign dividend credit, not `fc_amt`. Do not silently swap fields.
7. Zero realized gains are not evidence of zero total portfolio return. Missing transaction rows are not proof of zero cash flows.
8. Trades, currency conversion, withdrawals, and order edits remain blocked (`enableTrading:false`). Only read-only `/inquiry/` and account-list calls are made.
9. NH API rate limits are observed and never automatically bypassed. On `APP 호출 거래건수를 초과` stop and retry in a later session, not in a loop.
10. All tooling keeps account numbers out of successful model-visible report objects. No transaction history or account numbers are persisted by these new tools.

## Tests

```sh
npm run build
node --test scripts/portfolio.test.mjs scripts/history.test.mjs scripts/performance.test.mjs
```

Future accuracy work: per-account net-asset snapshots **including cash, unsettled balances and liabilities without double counting**; a reconciled external cash-flow ledger and brokerage pagination before claiming an actual monthly portfolio return.

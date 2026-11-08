# Portfolio history, monthly valuation tracking, and dividends

New read-only MCP tools:

| Tool | Behavior |
| --- | --- |
| `portfolio_capture_snapshot` | Captures Korea + US securities holdings at most once each Korea-local day. Stores locally on WSL. |
| `portfolio_history` | Reads all or month-filtered observations, amount changes, and position valuation history. |
| `portfolio_dividend_report` | Reads foreign-stock daily transactions for a requested month and groups **actual dividend deposits** by instrument and currency. |

## Privacy and data scope

* The local store is `~/.local/share/namuh-portfolio/snapshots/YYYY-MM-DD.json`, directory mode `0700`, file mode `0600`. Captured objects omit account numbers, app keys, secret tokens and raw API payloads. **Still sensitive financial data; back up securely**.
* Existing day's snapshot is immutable. Repeated calls do not request another broker balance. Creation uses exclusive file linking to prevent concurrent overwrites.
* Only securities' holding valuations from domestic KR and US are covered. Cash, receivables, other currencies, non-NH holdings and net worth are excluded.
* `holdings_value_change_pct` is **NOT** a return rate. Deposits, withdrawals, trading and FX changes can affect values. No historical time-weighted return or money-weighted return is claimed.
* Historical snapshots start on the first capture day; prior balances **cannot be backfilled** from this feature.
* Dividends use `fc_trd_amt` from `gbstockInquiryDailyTransaction` for transactions matching `외화배당금입금`; amounts are grouped by the source currency. It does not claim tax-gross dividends, and no currency conversion is guessed.
* Brokerage API may paginate results. The month tool reports observed rows and warns that continuation is not yet implemented.
* The underlying NH call budget is respected: daily snapshot short-circuits if that day already exists. HTTP 429 remains an explicit error, not automatically retried.
* Trading remains hard-disabled in `src/config.ts`. No new order, cancellation, FX conversion, or money movement endpoints.

## Daily automation (WSL systemd user service)

```sh
systemctl --user status namuh-portfolio-snapshot.timer
systemctl --user list-timers namuh-portfolio-snapshot.timer
journalctl --user -u namuh-portfolio-snapshot.service -n 20
systemctl --user start namuh-portfolio-snapshot.service   # manually trigger once, idempotent
```

The timer fires at **20:30 Asia/Seoul** every day while WSL is running. `Persistent=true` triggers a current-date capture after a missed run on the next WSL startup. It does not pretend to reconstruct historical dates missed while the computer was off. The existing WSL systemd user lingering service must remain enabled.

## Validation

```sh
npm run build
node --test scripts/portfolio.test.mjs scripts/history.test.mjs
```

To expose newly registered tools to ChatGPT, refresh/reconnect the already installed `namuh-portfolio` connector if tools are not immediately discoverable.

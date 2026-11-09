# Daily snapshot post-capture validation

After the read-only broker capture jobs, a separate **offline** check runs each day:
- `namuh-portfolio-snapshot.timer` — 20:30 Asia/Seoul
- `namuh-nav-candidate.timer` — 20:40 Asia/Seoul
- `namuh-capture-validation.timer` — 20:55 Asia/Seoul

The validation runner is `scripts/validate_daily_capture.mjs` and uses `src/daily-capture-gate.ts`. It reads the existing private holdings-only and NAV-candidate snapshot stores and **never calls brokerage APIs or repairs source files**.

The new MCP tool `portfolio_daily_capture_gate` provides the same on-demand check.

## Result codes
- `PENDING_VALIDATION_WINDOW`: before 20:50 KST, missing today's data cannot be called a capture failure; runner exits 0.
- `CAPTURE_INTEGRITY_REVIEW_REQUIRED`: after 20:50, one file is absent, invalid, or the timestamp gap exceeds 30 minutes; runner exits 2 to expose status to systemd.
- `CAPTURED_ACCOUNTING_REVIEW_REQUIRED`: both required daily files are collected within the time-window, but NH item-sum reconciliation is still under review; runner exits 0 (data capture succeeded, accounting not proven).
- `CAPTURED_SOURCE_CHECK_PASS`: both files and timing pass an offline source consistency check; exits 0. **This never implies investor return or verified total account NAV**.
- `CAPTURE_VALIDATION_FAILED`: offline read or schema error; runner exits 1. Journal output is limited to event codes, not raw broker account data or portfolio amounts.

Notes:
- The gates compare **same-date** files, their captured UTC timestamps, and schedule timing. A day with a capture deliberately taken before market close may remain marked as temporally separated from the evening paired capture, and immutable source files are never overwritten to hide this.
- A disabled WSL or laptop cannot execute jobs while powered off. `Persistent=true` only tries to run a missed systemd timer activation after the service manager becomes available, and does **not** reconstruct historical market prices or old daily files.
- Distinct scope (securities-only vs broker-reported unverified NAV), FX/collateral overlap, and incomplete external cash flow mean that **no performance return is calculated**.
- This gate does not send mail, notifications, orders, withdrawals, or currency exchanges. NH support draft remains unsent.

## Verification
```sh
npm run build
node --test scripts/*.test.mjs
node scripts/validate_daily_capture.mjs
systemctl --user list-timers --all | grep namuh
journalctl --user -u namuh-capture-validation.service --no-pager -n 30
```

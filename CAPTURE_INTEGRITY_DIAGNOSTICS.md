# Namuh Snapshot Integrity and Safe Recovery Diagnostics

New MCP tool: `portfolio_capture_integrity`. It reads existing snapshots only, never performs an NH broker API request, writes or repairs files, or sends mail. The latest complete run is checked against Asia/Seoul local schedule rather than assuming missing data equals failure.

## Timers and policies
- Daily holdings-only snapshot: `namuh-portfolio-snapshot.timer` at **20:30 Asia/Seoul**.
- Daily broker NAV candidate snapshot: `namuh-nav-candidate.timer` at **20:40 Asia/Seoul**.
- Before the time scheduled for an absent current-day file, state is `PENDING_SCHEDULE`, **not a failed job**. After the scheduled time, `DUE_BUT_MISSING` indicates a missing expected file, but is not proof of the service error until `systemd` result/journal has been examined.
- `TODAY_CAPTURED` means a file exists, not that the broker accounting or investment returns were verified.
- Old missing days cannot be reconstructed by querying today's live balances; **no synthetic backfill** is performed.
- Idempotent original capture functions do not overwrite existing dated files, and do not call the broker if that date already exists.
- The tool reports unmatched dates and same-day matched pairs, including separate acquisition UTC timestamps and minutes between their capture times. Same-date holdings and cash-inclusive broker NAV candidates have different accounting scopes/timestamps and must not be subtracted or used as actual portfolio performance.
- Failures such as rate limit/auth issues require manual or explicitly authorized same-day retry with broker call limits; the diagnostic tool **does not retry**.

## Observed 2026-11-09 around 09:35 KST
- Holdings-only: latest **2026-11-08**, 1 file; today `PENDING_SCHEDULE`.
- Broker NAV candidate: **2026-11-09**, 1 file; `TODAY_CAPTURED`.
- No common calendar-day pair yet.
- Service journal: latest holdings job succeeded on 2026-11-08; NAV service succeeded 2026-11-09 (same-day no-op). Both timers are enabled and active.
- The schedules will naturally offer the first same-day pair after both expected captures succeed. Timer success alone cannot guarantee that broker valuation is real-time or that the source NAV formula is correct.

## Validation
```sh
npm run build
node --test scripts/*.test.mjs
systemctl --user list-timers --all | grep namuh
journalctl --user -u namuh-portfolio-snapshot.service -u namuh-nav-candidate.service --since yesterday
```

Safety: no NH email sent; original Gmail draft not touched; trading remains disabled with `enableTrading:false`.

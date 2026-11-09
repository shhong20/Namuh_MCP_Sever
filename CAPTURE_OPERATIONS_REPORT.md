# Portfolio capture operational quality — observed-only report

New read-only MCP tool: `portfolio_capture_ops_report({days?: 1..90})` (default 30 days). It reads local **systemd user journal** events for:
- `namuh-portfolio-snapshot.service` (20:30 KST)
- `namuh-nav-candidate.service` (20:40 KST)
- `namuh-capture-validation.service` (20:55 KST)

## Indicators
- Number of **observed job result events**, observed successes and failures by service.
- `observed_success_pct`: successful results **among the log events seen**. This is **not** daily schedule compliance, 24-hour uptime or a broker API SLA. Manual starts and scheduled starts are not yet distinguishable from a payload alone.
- Reasons for failures grouped into allowlisted failure categories only. The result **never** exposes raw provider error payloads, tokens, account identifiers, journal entries or counterparties.
- New files created vs already-existing no-op results.
- Duration in milliseconds (min, p50, p95, max) where measured; older logs without this value remain **unknown**, not zero.
- NAV source page counts and the number of broker calls, where logged; old entries remain unknown.
- Completeness warning: user journal may be truncated or missing across WSL downtime, boot, rotation, or deleted logs. Missing service invocations **cannot** be inferred as successes or failures without a trusted schedule/boot record.

The 3 capture entrypoint scripts now emit `duration_ms` using a monotonic clock. The NAV entrypoint logs `source_pages` and `broker_calls` when a new candidate was created, and 0 for no-op. The securities-only entrypoint logs three successful broker reads (account + domestic + overseas) when a new file was created, and 0 for a no-op. This count is not emitted for failures where a request may have stopped midway.

## Baseline at implementation on 2026-11-09
The previous journald output contains one result event for holdings, one for NAV and one for offline validation. Each reports success, for **3 observed events**. No comparable `duration_ms`, page-count, or call-count samples are present in those legacy events. Do not claim proven 100% uptime or a live endpoint latency from this baseline.

## Safety
- The tool calls **only local journalctl**; no NH network request, trading, transfers or recovery jobs.
- `enableTrading:false` unchanged.
- No NH technical support mail sent. Any draft remains untouched.
- No existing snapshots or systemd schedules changed.
- This is a passive report and does not initiate monitoring alerts or scheduled delivery.
- If systemd journal is unavailable, the MCP tool fails without exposing raw logs.

## Validation
```sh
npm run build
node --test scripts/*.test.mjs
journalctl --user -u namuh-portfolio-snapshot.service -u namuh-nav-candidate.service -u namuh-capture-validation.service --since '30 days ago' --no-pager
```

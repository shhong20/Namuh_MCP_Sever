# Safe classification and manual review for portfolio capture failures

This release adds a read-only MCP tool `portfolio_capture_recovery_readiness`. It does **not** make broker calls or change storage/systemd. It combines the existing daily gate and existing immutable dated files to recommend whether a human should *investigate* a same-day missing file.

## Failure classification

`classifyCaptureError` distinguishes:
- `AUTH_REQUIRES_REVIEW`: NH access-token or credential issues. No automated retries.
- `BROKER_RATE_LIMIT`: HTTP 429, quota exhaustion. No automated retries.
- `NETWORK_UNAVAILABLE`: WSL or outbound connectivity failure. No automated retries.
- `BROKER_HTTP_FAILURE`: unrecognized non-200 responses. No automated retries.
- `SOURCE_PAGINATION_INCOMPLETE`: missing/repeated NH continuation or failed completion. No partial NAV stored.
- `BROKER_BUSINESS_RESPONSE_UNEXPECTED`: incompatible success/business response. No invalid snapshot stored.
- `STORAGE_PERMISSION_OR_INTEGRITY`: unsafe permissions, disk-full, corrupt snapshot, or related filesystem error.
- `UNKNOWN_FAILURE`: inspect service status/journal manually.

Both scheduled capture scripts now log **only the failure class and sanitized action**, not raw provider error payloads, account numbers, tokens, or API response bodies.

## Manual recovery gate

- Before **20:55 KST**, an absent same-day file is `WAIT_FOR_SCHEDULE` rather than failed.
- An existing immutable file gives `ALREADY_CAPTURED_NO_ACTION`, so no broker call is necessary.
- After **20:55 KST**, a missing same-day file can be `ELIGIBLE_FOR_MANUAL_REVIEW`. This status is **not an authorization or execution** of a brokerage retry.
- Human must inspect systemd service status/journal, network, auth and quota status. Brokerage repair requires separate explicit approval and happens only for that day's original capture.
- No backfilling historical NAV by querying present valuations; no overwriting existing files.
- Recorded account NAV and external cash flows remain unverified; financial return calculations stay disabled.
- Existing three timers at 20:30, 20:40 and 20:55 do not change. Failure classification is passive and produces no mail/notifications.
- NH technical support draft remains unsent and untouched.

## Validation

```sh
npm run build
node --test scripts/*.test.mjs
systemctl --user list-timers --all | grep namuh
journalctl --user -u namuh-portfolio-snapshot.service -u namuh-nav-candidate.service -u namuh-capture-validation.service --since yesterday --no-pager
```

Production service `namuh-mcp-tunnel.service` continues to run with `enableTrading:false`.

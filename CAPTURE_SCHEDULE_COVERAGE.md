# Scheduled capture coverage vs WSL boot-window evidence

New read-only MCP tool: `portfolio_capture_schedule_coverage({days?:1..90})`.

Compares the three configured KST nominal schedules (20:30 holdings, 20:40 broker NAV candidate, 20:55 offline validation) with sanitized outcome events already present in the **systemd user journal** and WSL boot windows returned by `journalctl --list-boots -o json`. Neither this report nor its tests makes any NH brokerage request.

## Conservative counting rules

- Per-service reporting starts **only with that service's first observed result**, not with the beginning of the queried 30-day window. An earlier timer installation date has not been independently established.
- A date is eligible only when its scheduled KST time has passed. Morning executions for a future evening slot are not counted as scheduled-time results.
- Multiple outcomes on a date count as one due date; any observed failure keeps that date in `OBSERVED_FAILURE_ON_DATE`, including a later success.
- `OBSERVED_SUCCESS_ON_DATE`: one or more logged successful outcomes after that day's due time. Does **not** prove the event was triggered by the timer; manual and Persistent catch-up runs may match.
- `NO_RESULT_WITH_WSL_RUNTIME_EVIDENCE`: boot-window timestamps span the nominal slot, but no result event observed. Does **not** prove the user timer was active or the job failed.
- `NO_RESULT_RUNTIME_UNCONFIRMED`: no result and no suitable boot-window evidence. Does **not** prove the WSL host was off: journald retention and interrupted boot may be responsible.
- `full_schedule_success_rate:null` and `wsl_downtime_confirmed:false` are unconditional. `observed_result_coverage_pct` measures only the fraction of post-baseline due slots with at least one logged result; it is not an SLA success rate.

## Live observations, 2026-11-09 10:13 KST

| Service | First observed result day | Due slots since first observation | Due days with result | Actual timer invocation proved? |
|---|---|---:|---:|---|
| Holdings | 2026-11-08 | 1 | 1 | No |
| NAV candidate | 2026-11-09 | 0 | 0 | No |
| Offline verification | 2026-11-09 | 0 | 0 | No |

All results are preliminary and do not imply full schedule availability or actual portfolio investment returns.

## Failure and security boundaries

- No broker orders, deposits, FX or API calls.
- Read-only user journal and boot metadata only. The report exposes event codes, dates and counts; never raw journald messages, account identifiers or login credentials.
- The timer files, source snapshot files, model data, user notification settings and previous unsent NH email draft remain unchanged.
- WSL boot intervals are **supporting evidence**, not a strict reconstructed online/offline timeline; absence of logs is explicitly uncertain.
- As with the previous ops report, journal truncation or missing records limits completeness. This tool fails safely when journalctl does not return a parseable boot list.

## Verification
```sh
npm run build
node --test scripts/*.test.mjs
```

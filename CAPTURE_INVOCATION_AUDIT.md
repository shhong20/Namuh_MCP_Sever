# Service execution correlation — systemd invocation IDs

Read-only MCP tool: `portfolio_capture_invocation_audit({days?:1..90})`.

## What is correlated
The journal manager start/finish entries for `namuh-portfolio-snapshot.service`, `namuh-nav-candidate.service`, and `namuh-capture-validation.service` include `USER_INVOCATION_ID`, while their Node application result records include `_SYSTEMD_INVOCATION_ID`. Within the **same _BOOT_ID**, this tool joins:
- manager job start and terminal status (`JOB_RESULT`);
- application outcome codes, without returning raw journal messages;
- current `systemctl --user show` `ExecMainStatus` **only when InvocationID matches**.

The tool also shows current timer active state and the timer's last recorded trigger timestamp (when available). A last-trigger timestamp alone cannot establish that a specific service invocation was timer-triggered, so `timer_activation_proven:false` and `confirmed_timer_triggered_invocations:0` do **not** mean that timers were broken. Do not interpret this as a verified timer-activation count. `schedule_success_rate:null` remains intentionally unavailable.

Older unit invocations without a matching current InvocationID will never inherit that unit's latest exit code. Application event without manager terminal event and vice versa are distinct incomplete evidence cases.

## Observed WSL result on 2026-11-09
- Four invocation records matched manager and application results across holdings (1), NAV candidate (1), validation (2).
- All four had `JOB_RESULT=done` and application success-state codes.
- Current `ExecMainStatus=0` could be associated only with the current matching InvocationID entries (NAV and one validation); an older validation instance and a cleared holdings InvocationID remain uncorrelated with current exit status.
- These were runs already observed in the user journal, which may include manually started instances. Exact launch trigger has not been proven.

## Safety
- No portfolio/account number, tokens, raw provider errors or journal text are returned. Invocation IDs are truncated to 8-character non-secret hints in the diagnostic.
- No broker network calls, order, cash movement, saved snapshot mutation, timer edits or email sending.
- The unsent NH support Gmail draft remains untouched.
- Trading hard-disable persists.

## Validation
```sh
npm run build
node --test scripts/*.test.mjs
```

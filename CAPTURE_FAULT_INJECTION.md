# Isolated Fault Injection — 2026-11-09

This release adds **isolated, real filesystem** tests for daily holdings-only and unverified broker NAV candidate captures. No live NH brokerage API was called, no real portfolio snapshot was modified, and no trading was enabled.

## Test design
- `captureDailyWithSources` and `captureNavWithSources` extract the existing capture flow behind injected read-only data providers. Production `captureDaily` and `captureNavCandidate` retain the same NH API parameters and behavior.
- Synthetic provider callbacks are used only for test cases. Fake account identifiers never reach any real API.
- All test persistence occurs under a disposable `mkdtemp` sandbox with `NAMUH_PORTFOLIO_SNAPSHOT_DIR` and `NAMUH_NAV_CANDIDATE_DIR` pointed there.
- The sandbox is removed after each test. The actual daily timers, source records, authorized operations, account credentials and other applications remain untouched.

## Nine fault scenarios
1. Synthetic authentication, rate-limit, and network failures: no automatic retry; existing holdings bytes unchanged; re-running a saved day produces zero source calls.
2. Twenty concurrent holdings saves for the same date: **one winner**, immutable 0600 final file and no orphan temp files.
3. Synthetic NAV auth and rate-limit failures and incomplete continuation: no partial candidate file.
4. Twenty concurrent NAV candidate saves: **one winner**, 0600 file, no untracked temp files.
5. Invalid storage symlink/path (as opposed to normal directory): rejected without changing any unrelated preexisting file.
6. Domestic holdings API success followed by simulated overseas API failure: no partial holdings save.
7. Broker pagination repeatedly returns the same opaque cursor: fail closed, no partial NAV snapshot.
8. Simulated `ENOSPC` disk-full category: safe classification; unchanged original snapshot. **This case is a synthetic injected exception, not a real full disk or a kernel-level disk exhaustion test.**
9. Invalid 0755 snapshot directory permissions: save refused, existing snapshot bytes unchanged.

## Results
- 9/9 isolated fault tests passed.
- Entire repository suite: 70/70 PASS.
- Build and `git diff --check`: PASS.
- No production data corruption or provider-side mutation.
- No evidence of actual rate-limit, storage, or auth failures in the live source; only the synthetic scenarios have been exercised.

## Explicit safety boundaries
- Broker trading lock `enableTrading:false` remains.
- No attempts to submit orders, transfers or FX operations.
- These tests do not prove behavior for a real full disk under sudden OS failure or for network failure after an actual broker request. A real recovery rehearsal would need explicit isolated operational approval and a separate environment.
- No automatic broker retry and no backdated portfolio valuations.
- NH technical support email remains unsent.

Run the suite:
```sh
npm run build
node --test scripts/capture-fault-injection.test.mjs
node --test scripts/*.test.mjs
```

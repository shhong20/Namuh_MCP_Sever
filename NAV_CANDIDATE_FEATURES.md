# Cash-inclusive broker NAV candidates and external transfer review

This release adds 3 read-only MCP tools:

- `portfolio_capture_nav_candidate`: Fetch all pages of NH `krstockInquiryAssetStatus`, verify terminal pagination, parse reported `nas_amt` and `tot_aet_amt`, check per-item sum discrepancy, and store only an **unverified, broker-reported candidate**. Once per calendar day, immutable.
- `portfolio_nav_candidate_history({month?})`: Return history of broker-reported cash-inclusive NAV **candidates** without claiming actual verified net assets or investment returns.
- `portfolio_transfer_review_queue({month})`: Compare the existing common-account entry/withdrawal + total transaction records and emit a privacy-reduced review queue for transfer-in/out candidates. This is not a verified external-contribution ledger.

## Snapshot storage and scheduler
- Existing `~/.local/share/namuh-portfolio/snapshots/YYYY-MM-DD.json` holds **holdings-only** snapshots, unchanged.
- New `~/.local/share/namuh-portfolio/nav-candidates/YYYY-MM-DD.json` holds broker-reported, **unverified** NAV candidates.
- New directory 0700 and files 0600, atomic exclusive-link create, no overwrite, no raw account identifiers or raw broker payloads, no securities positions stored.
- Candidate capture refuses missing, malformed, zero or negative reported NAV, incomplete/duplicate cursor pages, malformed valuation items.
- The daily `namuh-nav-candidate.timer` captures at 20:40 Asia/Seoul, 10 minutes after the existing holdings-only timer. The systemd user timer is persistent; missed days cannot be backfilled without historic broker values.

## 2026-11-09 initial candidate
- NH reported net asset value candidate `nas_amt=7,920,363 KRW`.
- Individual collected items exceed broker total assets by `704,899 KRW`.
- Account for this discrepancy before claiming full verified NAV. `verified_full_nav=false`, `usable_for_investment_return=false` at all times.

## Source provenance validation
- October 2026 source queries yielded an unresolved transfer-in **candidate**. It is not automatically accepted as investor contribution.
- Review queue IDs derive from date, amount, currency and sanitized transaction label; source names/accounts are never exported.
- Required independent evidence: originating bank/account ledger, whether transfers occurred within one's invested accounts, and currency/FX/settlement context.
- Even a verified transfer record **alone** does not prove complete external flow history for the period; completeness and beginning/ending NAV must also be verified.

## Safety
- NH trading remains hard disabled `enableTrading:false`.
- No mutation to brokerage account. No broker writes.
- No changes to old holdings snapshot schemas or stored files.
- `portfolio_return_readiness` shows count of stored NAV candidates separately from **verified NAV snapshots** (still 0).
- No monthly performance estimate is automatically claimed using the unverified series.

## Tests
```sh
npm run build
node --test scripts/*.test.mjs
systemctl --user list-timers namuh-nav-candidate.timer
```

Next work: reconcile the `nas_amt` composition, identify duplicated collateral and cash items under NH accounting definitions, then add an authenticated independent source proving whether candidate deposits are true external flows before activating automated performance metrics.

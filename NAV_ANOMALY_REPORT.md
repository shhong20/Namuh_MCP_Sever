# NAV candidate anomaly reporting (read-only)

New tool: `portfolio_nav_anomaly_report({month?:"YYYY-MM"})`.

This tool reads the existing private, immutable snapshot directories only:
- `~/.local/share/namuh-portfolio/nav-candidates/YYYY-MM-DD.json`
- `~/.local/share/namuh-portfolio/snapshots/YYYY-MM-DD.json`

It makes **zero NH brokerage requests**, writes no files, sends no emails/notifications, and never enables trading.

## Diagnostics

- `NO_SAME_DAY_COMPOSITION_EVIDENCE`: older NAV candidate snapshot lacks contemporaneous detailed margin/cash audit.
- `BROKER_ITEM_SUM_MISMATCH`: broker reported asset total does not equal naive listed-asset sum.
- `MARGIN_EXPLANATION_HAS_RESIDUAL`: line-item difference less foreign margin exceeds 1 KRW in absolute terms. Numeric proximity is not a validated accounting equation.
- `CALENDAR_GAP_BETWEEN_OBSERVATIONS`: saved NAV records are separated by more than one calendar day. This is a gap between observations, not necessarily a failed scheduler.
- `LARGE_DAY_OVER_DAY_CANDIDATE_CHANGE`: **only when dates are consecutive** and unadjusted broker NAV candidate change is 5% or greater in absolute value. This is NOT an investment return and is not flow adjusted.
- `NO_HOLDINGS_SNAPSHOT_ON_DATE`: a matching holdings-only snapshot does not exist for this NAV candidate date. The two automated timers still operate separately.

## Live test (2026-11-09)

The currently stored November candidate history held one observation; the diagnostic flagged an old-format detailed evidence gap, a nonzero line-item mismatch, and the lack of same-date holdings snapshot. No false historical records were generated; no actual return was reported.

## Accuracy and security

- All existing NAV candidate records remain unchanged and readable.
- All detailed accounting candidates remain `verified_full_nav:false` and `usable_for_investment_return:false`.
- Source records never expose broker account numbers, counterparty names or authentication secrets.
- Historical values and fund transfers are not invented, and the API does not silently turn valuation changes into return percentages.
- Broker trading lock `enableTrading:false` remains enforced.
- No NH support inquiry was sent. The previously saved Gmail draft is still unsent.

## Verification

```sh
npm run build
node --test scripts/*.test.mjs
```

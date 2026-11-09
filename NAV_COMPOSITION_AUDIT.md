# NH PLUG integrated asset composition audit

This release adds the read-only tool `portfolio_nav_composition_audit`.

## Verified live facts (2026-11-09)
- Two full integrated `assetStatus` pages collected, broker responses `00218 -> 00166`, zero duplicated rows.
- Six public asset groups were observed: domestic stocks, domestic ETF, RP, foreign stocks, foreign ETP, foreign cash deposit.
- Last read-only query: NH broker reported net assets `7,904,383 KRW`; summing all 15 listed assets `8,609,282 KRW`; difference `704,899 KRW`.
- Foreign cash total `938,254 KRW`; foreign margin `704,967 KRW`; orderable `233,287 KRW`. `938,254 - 704,967 - 233,287 = 0` as an observed numeric identity.
- The item-sum discrepancy `704,899 KRW` differs from foreign margin `704,967 KRW` by `-68 KRW`.

These are numerical observations **not** evidence that broker accounting requires adding/subtracting those individual fields. The 68 KRW residual is unresolved; do not invent a tax, FX rounding, interest or fee explanation.

## Code
- `src/nav-composition.ts`: group-only per-asset accounting observation; broker summary fields kept non-additive; independent residual comparisons; malformed items handled as incomplete; no raw account number, ticker, customer names, or cursor exposed.
- `portfolio_nav_composition_audit`: newly exposed MCP tool, read-only (one account discovery and 1-12 sequential assetStatus pages).
- `verified_full_net_asset_krw` remains null and `return_calculation_allowed` remains false even when all line totals equal the broker total, pending authoritative accounting policy plus externally verified cash flows.
- Existing private NAV-candidate and holdings snapshots, both daily timers, and all other MCP tool definitions remain unchanged.

## Still required
1. Broker-authoritative definition of `nas_amt`, `tot_aet_amt`, `krw_tsl_fc_dca`, `krw_tsl_fc_mgg_amt`, and `krw_tsl_fc_orr_pbl_amt`, including which financial products and cash equivalents are already consolidated.
2. Reconcile the persistent 68 KRW residual across valuation/settlement time boundaries; do not presume fee or rounding cause without evidence.
3. Independent evidence for whether October's `이체입금` candidate represents new investor contribution, inter-broker transfer, or other internal account movement. NH alone does not confirm the origin.
4. After all external flows and verified opening/closing NAV exist, activate actual period returns with separate validation. Until then `monthly_total_return_pct` stays null.

## Verification
```sh
npm run build
node --test scripts/*.test.mjs
```

No orders, transfers or FX conversions performed. `enableTrading:false` stays hardcoded and current daily systemd timers are not modified.

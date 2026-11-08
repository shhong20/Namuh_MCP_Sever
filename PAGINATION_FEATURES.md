# Namuh PLUG complete pagination for integrated asset accounts

## Verified NH behavior

On 2026-11-08, `/krstock/inquiry/v1/assetStatus` returned the opaque continuation token in the HTTP response header `cts` and the continuation flag in `cts_flag`. **Both headers must be passed to the next request**. Sending only `cts` caused the same first 10 rows to repeat; the updated two-header implementation yielded 2 pages, 15 unique rows and terminal broker result `00166`.

Official SDK documentation corroborates passing both values: https://github.com/PLUG-OpenAPI/nhplug-sdk

## Implementation

- `src/client.ts`: Adds `callRestPage()` returning broker result with private continuation metadata. Existing `callRest()` callers are unchanged and see only the response body. Opaque cursor strings are never emitted by MCP tools.
- `src/pagination.ts`: Bounded (20 pages by default, 50 hard maximum), no automatic broker retries. Blocks missing or repeated cursors, duplicate row payloads across pages, malformed broker statuses, and page-cap overruns.
- `portfolio_net_asset_audit` now combines terminal integrated asset pages before cross-checking with domestic and US holdings. It reports pagination evidence including page count, row count and result codes.
- A completed list response is **not** the same as a reconciled net asset. `broker_reported_net_asset_candidate_krw` is available when the complete API returns a positive value. `verified_full_net_asset_krw` remains null pending validation of official accounting definitions, cash equivalents, deposits/withdrawals, settlements and liabilities.
- Current daily holdings-only snapshots remain unchanged; these values must not be reclassified as full account NAV.

## Regression & manual checks

```sh
npm run build
node --test scripts/*.test.mjs
systemctl --user status namuh-mcp-tunnel.service
```

## Further data integration

The **NH PLUG public API catalog lists common-account comprehensive transaction history and deposit/withdrawal history** (announced on 2026-09-17). These are not in this fork's installed stock-only OpenAPI specifications. Add their exact officially documented paths and schemas in a separate change **before** implementing and claiming a complete external cash-flow ledger. Do not guess paths, code values, currency rules, or request shapes.

# NH PLUG accounting interpretation and transfer provenance — evidence gate

## 2026-11-09 read-only observations (not verified accounting identity)
- Integrated assetStatus (complete): 2 pages, 15 distinct asset rows, broker response `00218 → 00166`.
- NH reported NAV candidate: 7,904,053 KRW at one read-only observation.
- Listed line item sum: 8,608,952 KRW; difference: 704,899 KRW.
- `krw_tsl_fc_dca` (KRW-converted foreign deposit): 938,254 KRW.
- `krw_tsl_fc_mgg_amt` (KRW-converted foreign collateral/margin): 704,967 KRW.
- `krw_tsl_fc_orr_pbl_amt` (KRW-converted foreign orderable): 233,287 KRW.
- Observed `938,254 - 704,967 - 233,287 = 0`; residual `704,899 - 704,967 = -68 KRW`.
- These observations do NOT establish a broker-endorsed NAV formula. The 68 KRW difference is unexplained.

## Official descriptions examined

The NH PLUG `krstockInquiryAssetStatus` published OpenAPI schema describes:
- `nas_amt`: 순자산금액
- `tot_aet_amt`: 총자산금액
- `krw_tsl_fc_dca`: 원화환산외화예수금
- `krw_tsl_fc_mgg_amt`: 원화환산외화담보금액
- `krw_tsl_fc_orr_pbl_amt`: 원화환산외화주문가능금액
- `Output_1.eal_amt`: 평가금액

The schema does not provide a verified calculation formula mapping these fields to aggregate NAV. It also does not explain whether these are overlapping, time-shifted or additive balances. Do not invent an answer.

## Questions to ask NH API support (no credentials, account number or customer names)

1. For `krstockInquiryAssetStatus`, is `Output_1.eal_amt` additive across `외화예수금`, `주식`, `ETF`, `자유약정형 RP`, `외화주식`, `외화ETP`? Which line categories are already incorporated into `tot_aet_amt` or `nas_amt`?
2. How do `krw_tsl_fc_dca`, `krw_tsl_fc_mgg_amt`, `krw_tsl_fc_orr_pbl_amt` interact with total assets? Is `외화담보금액` collateral, held cash, excluded cash, or merely a trading availability metric?
3. Are valuation `eal_amt` amounts and summary `nas_amt` calculated at identical FX and settlement timestamps? What is the policy for per-line rounding? Can a small residual occur across these fields?
4. What is the authoritative cash-inclusive NAV definition for performance calculation, including unsettled transactions, deposits, liabilities and RP products?
5. For `commonInquiryDepositWithdrawal` and `commonInquiryTotalTransaction`, what fields or codes distinguish incoming **external investor contributions** from same-owner internal transfers, foreign-currency conversions, dividends and brokerage settlements? Does a complete external transfer ledger require another account/source?

NH PLUG public API documentation: https://www.nhplug.com/apiservice
NH PLUG Q&A/support: https://www.nhplug.com/community/10000000-0000-0011-0000-000000000001

## New code behavior
- The new `portfolio_nav_accounting_trend` tool compares private NAV candidates by date and reports contemporaneous margin/residual details when available.
- `src/nav-candidate.ts` stores **optional** same-response accounting evidence on new NAV candidates. All previously stored candidate snapshots stay immutable and readable. Historical unknown data remains null.
- No additional NH API calls are needed by the scheduled 20:40 NAV candidate capture job.
- Stability of a 68 KRW residual across dates will not certify an accounting formula or permit investor return calculations.

## External transfer origin gate
The October 2026 `이체입금` is a candidate only. An independent source (originating bank/broker movement at matching date, currency, amount, and ownership) has not been supplied or connected. It must NOT be marked verified. Even a matched bank record might represent transfer between the investor's own accounts, not fresh contributions. The automatic return gate remains closed until full external cashflow history and cash-inclusive opening/closing NAV are verified.

## Validation
```sh
npm run build
node --test scripts/*.test.mjs
```
Trading disabled (`enableTrading:false`), existing WSL timers and old snapshot stores unchanged.

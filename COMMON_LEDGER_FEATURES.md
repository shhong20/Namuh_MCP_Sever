# NH PLUG common account ledger integration

Source (official NH PLUG documentation):
- https://www.nhplug.com/openapi-docs/common/openapi.json
- https://www.nhplug.com/llms-full.txt

The API specs added to this repository are `specs/common.openapi.json`. Only the two common-account **inquiry** operations are exposed through generic `list_apis` / `call_api`:
- `commonInquiryTotalTransaction` → `POST /common/inquiry/v1/totalTransaction` (HTS 8203)
- `commonInquiryDepositWithdrawal` → `POST /common/inquiry/v1/depositWithdrawal` (HTS 8207)

The common spec also contains `/oauth2/token` and `/n2/acctinfo`, but `src/spec.ts` excludes them from generic discoverable operations. Account listing remains available only through the dedicated, existing `list_accounts` tool.

## High-level query

`portfolio_common_cashflow_audit({month:"2026-11"})` queries both sources sequentially for the one live account (type `01`), bounded to month and current Seoul date. Both return transaction arrays in `Output_0`, unlike stock inquiry results (`Output_1`).

Request defaults come from the official schema:
- depositWithdrawal: `iqr_tp_cd=1`, `act_trd_dtl_cd=01` (all)
- totalTransaction: `iqr_tp_cd=1`, `iqr_rge_cd=2` (include AMB/CMA), `iem_llf_cd=00` (all assets), `act_trd_dtl_cd=00` (all)

The collector preserves both opaque `cts` and `cts_flag` headers, limits the number of pages, fails closed on missing/repeated cursors and duplicate row payloads, and never returns continuation tokens to ChatGPT.

## Data safety and financial correctness

- Returns fields limited to transaction date, actual date, source currency if present, transaction amount, type description, direction *candidate*, and `externally_verified:false`.
- Explicitly removes counterparty, requestor, memo, account and other personally identifiable fields such as `opi_cus_fnm`, `cli_pe_fnm`, `rks3`, `rks4`, `act_no`.
- DepositWithdrawal `Output_0` lacks `cur_cd`; returns `UNSPECIFIED`, never silently assumes KRW.
- A money deposit/withdrawal from the account is not necessarily an **external investor contribution/withdrawal**. Transfers between one's accounts, conversions and internal brokerage events can look like cash flows.
- No tax, FX, flow or investment return can be accurately computed from the label/amount alone. `verified_net_external_flow_krw:null` and `ready_for_portfolio_return:false` are deliberate.
- Raw counterparties and account identifiers are **not persisted** by this addition.
- Broker limits/HTTP 429 fail without unbounded retries. The existing trade lock `enableTrading:false` remains unchanged.
- Daily holdings-only snapshots and the 20:30 Seoul systemd timer are unchanged.

## Verification performed (2026-11-08)

A live read-only request for November returned:
- Deposit/withdrawal endpoint: code `13578`, 0 rows, terminal one page.
- Comprehensive transaction endpoint: code `00166`, 3 rows, terminal one page.
- The new public output had no raw customer-name/account fields.
- This does not prove that no external cash transfers occurred in other account histories.

## Regression

```sh
npm run build
node --test scripts/*.test.mjs
```

Future work to make exact cash-flow-based investment returns:
1. Verify broker rules distinguishing bank-side contributions from interaccount transfers and internal cash postings.
2. Reconcile settlement movements and FX conversion on a currency-by-currency basis.
3. Establish a verified cash-inclusive account NAV series at the same time boundaries.
4. Enable account-level returns **only** when the source ledger and NAV can be certified complete.

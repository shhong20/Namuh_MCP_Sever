# Common-account cashflow cross-check (2026-11-08)

The existing `portfolio_common_cashflow_audit({month:"YYYY-MM"})` now provides a `cashflow_crosscheck` that matches individual depositWithdrawal records to comprehensiveTransaction rows on **date, amount and (when possible) description**. It does not return account identifiers, customer/counterparty names, free-form notes, or raw API payloads.

## Important distinctions
- `reported_credit_rows` and `reported_debit_rows`: all deposit API reported movements, **including internal dividends and interest**, not new contributions.
- `candidate_inflows` and `candidate_outflows`: only transfer-type movements that warrant further external-source verification.
- `cashflow_crosscheck.categories.internal_dividend`: brokerage-paid dividend credit, an **internal return**, not an external contribution.
- `cashflow_crosscheck.categories.internal_interest`: brokerage cash-interest/예탁금이용료, an **internal return**.
- `cashflow_crosscheck.categories.transfer_in_candidate`: deposit described as transfer; source bank/account owner NOT verified.
- Matched source records prove consistent *bookkeeping representation*, not that a transfer came from outside the investor's portfolio.
- All fields reporting actual verified external investor contributions/withdrawals and automatic portfolio return remain `null/false`.

## Read-only live audit (2026-10)
- 4 depositWithdrawal records; 7 comprehensiveTransaction records.
- 4/4 deposit movements matched by date, amount and label.
- Identified two dividend credits, one deposit-interest credit, and one transfer-in **candidate**.
- Complete source pagination for the queried October window.
- Actual verified external contribution in KRW: **unavailable**. Deposit API lacks an explicit currency field.

## Safety
No change to original account snapshot files, daily timer, or brokerage trade lock (`enableTrading:false`). No raw customer information persisted. Known unknowns or duplicate collisions fail closed; the API does not silently supply an investment return.

## Tests
```sh
npm run build
node --test scripts/*.test.mjs
```

Next: verify bank-origin provenance for interaccount transfers and cash-inclusive NAV at matching time boundaries. These need independent evidence; transfer labels alone cannot prove external contributions.

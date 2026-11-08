# Namuh portfolio MCP read-only analysis

The ChatGPT-connected server exposes four additional read-only tools:

* `portfolio_overview` — reads one **live** NH account (type `01`), domestic KR and US securities, returns position-level KRW market values, unrealized PnL, concentration and estimated FX/stock attribution. Does **not** add broker cash/settlement totals to position values.
* `portfolio_us_orders` — request `date: YYYYMMDD`; retrieves overseas order statuses (filled, unfilled, cancelled, partial). One order day only.
* `portfolio_kr_orders` — same, for domestic securities.
* `portfolio_savings_plan` — calculates emergency reserve and monthly contribution split without any trade execution.

## Guardrails
- The trading gate is hardcoded `enableTrading: false`. The new tools only use `/inquiry/` and `/n2/acctinfo` endpoints.
- No account number is returned by these new tools. Credentials remain in local `.env`.
- Portfolio overview covers Korean and US *securities*, not full net worth; broker balances may include unsettled cash and should never be blindly summed with individual holdings.
- FX attribution is an approximate reporting decomposition using broker-provided per-position valuation FX. Residuals should not be labelled purely as fees.
- Concentration and leveraged-position detection are heuristic; total ETF look-through exposure is NOT computed.
- Normalized order status is based on quantities and cancellation fields; disappearance of an order is not evidence of execution.
- An empty response with broker code `13578` means no matching records only in the specified implemented inquiry context. Other broker business responses remain unmodified in generic `call_api`.

## Validation
```sh
npm run build
node --test scripts/portfolio.test.mjs
```
Run after updating the source and before restarting the tunnel. The ChatGPT plugin may need refresh/reconnect to discover newly added tool definitions. Existing tool names are unchanged.

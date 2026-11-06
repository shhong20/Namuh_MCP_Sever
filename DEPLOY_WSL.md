# Namuh Portfolio — WSL personal deployment

Based on NH Investment & Securities official `PLUG-OpenAPI/nhplug-mcp` (MIT). Official upstream is maintained as git remote `upstream`.

## Safety policy

- This fork enforces `enableTrading: false` in source, regardless of `NHPLUG_ENABLE_TRADING`.
- Never commit `.env`, API keys, account numbers, token responses, portfolio holdings, or transaction data.
- The GitHub repository is **public**. Treat test logs and attachments as sensitive.
- Do not enable trading, expose MCP ports to the internet, or modify upstream security checks without separate review.

## Install on WSL

```bash
cd /home/hong/Namuh_MCP_Sever
npm ci --ignore-scripts
npm run build
```

## Local-only credentials

Run from your OWN trusted WSL terminal, not through chat or remote commands with credentials embedded:

```bash
cd /home/hong/Namuh_MCP_Sever
umask 077
cp -n .env.example .env
chmod 600 .env
nano .env
```

Fill only the existing `NHPLUG_APP_KEY` and `NHPLUG_APP_SECRET` placeholders in `.env`. Leave `NHPLUG_BASE_URL=https://api.nhplug.com:8443`, `NHPLUG_AUTH_URL=https://api.nhplug.com:8443` and `NHPLUG_ENABLE_TRADING=false`. Do not paste credentials into this conversation, shell command arguments, GitHub, or CI secrets unless explicitly needed.

## Verify (run privately)

```bash
npm run build
node scripts/selftest.mjs
```

`selftest` makes a real token and stock quote request; do not share its full response output. Report only PASS/FAIL with errors redacted. No account balances or positions need to be displayed during bootstrap.

## ChatGPT

The official implementation uses stdio MCP. Before registering in ChatGPT, provision an authenticated remote MCP transport (for example, a supported secure tunnel) and verify that the ChatGPT plan and plugin creation flow support that transport. Do not publish a direct unauthenticated HTTP bridge. Keep credentials exclusively on WSL, configure private access, and use a query-only tool allowlist. Test `list_apis`, `get_stock_price`, `list_accounts`, `get_stock_balance` once authenticated.

## Update

```bash
git fetch upstream main
# Review the upstream diff and re-apply hard read-only guard before updating.
```

Never blindly merge upstream over the read-only guard.

#!/usr/bin/env bash
# Namuh personal MCP -> ChatGPT Secure MCP Tunnel (interactive WSL terminal only)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
PROFILE=namuh-portfolio
TUNNEL_ID="${1:-}"
if [[ ! "$TUNNEL_ID" =~ ^tunnel_[[:alnum:]_-]+$ ]]; then
  printf 'Usage: bash scripts/connect_chatgpt_tunnel.sh tunnel_<id>\n' >&2
  exit 2
fi
if [[ ! -f .env || "$(stat -c '%a' .env)" != '600' ]]; then
  echo 'Missing .env or permissions not 600; fix locally first.' >&2
  exit 2
fi
if ! command -v tunnel-client >/dev/null 2>&1; then
  echo 'tunnel-client not on PATH.' >&2
  exit 2
fi
PROFILE_FILE="$HOME/.config/tunnel-client/$PROFILE.yaml"
if [[ -e "$PROFILE_FILE" ]]; then
  # Reuse without overwriting or changing any other tunnel.
  if ! grep -Fq "tunnel_id: \"$TUNNEL_ID\"" "$PROFILE_FILE"; then
    echo 'Existing Namuh profile belongs to a different tunnel. Refusing to modify.' >&2
    exit 2
  fi
  if ! grep -Fq 'env:CONTROL_PLANE_API_KEY' "$PROFILE_FILE"; then
    echo 'Existing profile uses a different API key reference. Check manually.' >&2
    exit 2
  fi
  printf 'Reusing existing Namuh profile with a fresh runtime key.\n' >&2
fi
printf 'Paste your OpenAI Platform tunnel RUNTIME key (input hidden): ' >&2
if ! IFS= read -r -s CONTROL_PLANE_API_KEY; then
  printf '\nNo interactive input available. Run in your WSL terminal.\n' >&2
  exit 2
fi
printf '\n' >&2
if [[ -z "$CONTROL_PLANE_API_KEY" ]]; then echo 'Empty runtime key.' >&2; exit 2; fi
export CONTROL_PLANE_API_KEY
trap 'unset CONTROL_PLANE_API_KEY' EXIT
npm run build >/dev/null
if [[ ! -e "$PROFILE_FILE" ]]; then
  tunnel-client init --sample sample_mcp_stdio_local --profile "$PROFILE" --tunnel-id "$TUNNEL_ID" --mcp-command "node $PWD/dist/index.js" --health-listen-addr 127.0.0.1:0
fi
if ! tunnel-client doctor --profile "$PROFILE" --explain; then
  echo 'Tunnel authentication/diagnostics failed. Not launching tunnel.' >&2
  exit 1
fi
printf '\nDoctor completed. Starting dedicated Namuh tunnel; keep this terminal open.\n'
tunnel-client run --profile "$PROFILE"

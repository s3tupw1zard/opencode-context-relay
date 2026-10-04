#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TARGET="$ROOT/.env"

if [ -e "$TARGET" ]; then
  echo "$TARGET already exists; refusing to overwrite it." >&2
  exit 1
fi

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required" >&2
  exit 1
}

secret() {
  openssl rand -hex 32
}

cat >"$TARGET" <<EOF
POSTGRES_DB=context_bridge
POSTGRES_PORT=5432
POSTGRES_ADMIN_PASSWORD=$(secret)
CONTEXT_BRIDGE_WRITER_PASSWORD=$(secret)
CONTEXT_BRIDGE_READER_PASSWORD=$(secret)

MCP_PUBLIC_URL=https://context.example.com/mcp
MCP_PORT=8787
MCP_AUTH_MODE=oauth
OAUTH_ISSUER=https://auth.example.com
OAUTH_ALLOWED_SUBJECT=REPLACE_ME
OAUTH_ALLOW_SHARED_BACKEND=false

MCP_TRUST_PROXY_MTLS=true
MCP_EXPECTED_OPENAI_SAN=mtls.prod.connectors.openai.com

STORAGE_TIMEOUT_MS=5000
STALE_AFTER_MS=900000
STORAGE_MAX_ROWS=1000
EOF

chmod 600 "$TARGET"
echo "Created $TARGET with random database passwords."
echo "Edit MCP_PUBLIC_URL, OAUTH_ISSUER and OAUTH_ALLOWED_SUBJECT before starting the stack."

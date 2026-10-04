#!/bin/sh
set -eu

DEST_DIR=${1:-/etc/nginx/mtls}
ROOT_URL="https://developers.openai.com/plugins/mtls/openai-root-ca.pem"
INTERMEDIATE_URL="https://developers.openai.com/plugins/mtls/openai-connectors-mtls-ca.pem"

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

curl --fail --silent --show-error --location "$ROOT_URL" -o "$tmp/root.pem"
curl --fail --silent --show-error --location "$INTERMEDIATE_URL" -o "$tmp/intermediate.pem"

openssl x509 -in "$tmp/root.pem" -noout >/dev/null
openssl x509 -in "$tmp/intermediate.pem" -noout >/dev/null
openssl verify -CAfile "$tmp/root.pem" "$tmp/intermediate.pem" >/dev/null

install -d -m 0755 "$DEST_DIR"
cat "$tmp/intermediate.pem" "$tmp/root.pem" >"$tmp/openai-connectors-ca.pem"
install -m 0644 "$tmp/openai-connectors-ca.pem" "$DEST_DIR/openai-connectors-ca.pem"

echo "Updated $DEST_DIR/openai-connectors-ca.pem"
echo "Run nginx -t and reload nginx after reviewing the result."

#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT=${1:-"$ROOT/context_bridge-$(date +%Y%m%d-%H%M%S).dump"}

set -a
. "$ROOT/.env"
set +a

docker compose --env-file "$ROOT/.env" -f "$ROOT/deploy/compose.yaml"   exec -T postgres   pg_dump -U postgres -d "${POSTGRES_DB:-context_bridge}" -Fc >"$OUT"

echo "Backup written to $OUT"

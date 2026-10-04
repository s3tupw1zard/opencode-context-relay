#!/bin/sh
set -eu

[ "$#" -eq 1 ] || {
  echo "usage: $0 BACKUP.dump" >&2
  exit 2
}

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP=$1

[ -f "$BACKUP" ] || {
  echo "backup not found: $BACKUP" >&2
  exit 1
}

cat "$BACKUP" | docker compose --env-file "$ROOT/.env" -f "$ROOT/deploy/compose.yaml"   exec -T postgres   pg_restore -U postgres -d "${POSTGRES_DB:-context_bridge}" --clean --if-exists

echo "Restore completed. Run the migration service again afterwards."

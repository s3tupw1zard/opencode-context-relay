#!/bin/sh
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${CONTEXT_BRIDGE_WRITER_PASSWORD:?CONTEXT_BRIDGE_WRITER_PASSWORD is required}"
: "${CONTEXT_BRIDGE_READER_PASSWORD:?CONTEXT_BRIDGE_READER_PASSWORD is required}"

DATABASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

psql_base() {
  psql -X -v ON_ERROR_STOP=1 "$@"
}

psql_base <<'SQL'
CREATE SCHEMA IF NOT EXISTS context_bridge;
CREATE TABLE IF NOT EXISTS context_bridge.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON context_bridge.schema_migrations FROM PUBLIC;
SQL

for file in "$DATABASE_DIR"/migrations/*.sql; do
  [ -f "$file" ] || continue

  version=$(basename "$file")
  checksum=$(sha256sum "$file" | awk '{print $1}')

  existing=$(
    psql_base -At -v migration_version="$version" <<'SQL'
SELECT checksum
FROM context_bridge.schema_migrations
WHERE version = :'migration_version';
SQL
  )

  if [ -n "$existing" ]; then
    if [ "$existing" != "$checksum" ]; then
      echo "Migration $version was already applied with a different checksum." >&2
      exit 1
    fi
    echo "Migration $version already applied."
    continue
  fi

  tmp=$(mktemp)
  trap 'rm -f "$tmp"' EXIT INT TERM

  cat "$file" >"$tmp"
  cat >>"$tmp" <<'SQL'

INSERT INTO context_bridge.schema_migrations(version, checksum)
VALUES (:'migration_version', :'migration_checksum');
SQL

  echo "Applying migration $version"
  psql_base -1     -v migration_version="$version"     -v migration_checksum="$checksum"     -f "$tmp"

  rm -f "$tmp"
  trap - EXIT INT TERM
done

psql_base -f "$DATABASE_DIR/roles/writer.sql"
psql_base -f "$DATABASE_DIR/roles/reader.sql"

psql_base   -v writer_password="$CONTEXT_BRIDGE_WRITER_PASSWORD"   -v reader_password="$CONTEXT_BRIDGE_READER_PASSWORD"   -v database_name="$PGDATABASE" <<'SQL'
ALTER ROLE context_bridge_writer PASSWORD :'writer_password';
ALTER ROLE context_bridge_reader PASSWORD :'reader_password';

GRANT CONNECT ON DATABASE :"database_name" TO context_bridge_writer;
GRANT CONNECT ON DATABASE :"database_name" TO context_bridge_reader;
SQL

echo "Context Bridge schema and roles are up to date."

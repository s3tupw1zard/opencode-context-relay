# Installation

> **Work in progress / early development.** APIs, schema details and deployment behavior can change between `2026.1.0-dev.x` releases. Keep backups and review upgrades before using this with important data.

## Prerequisites

- OpenCode v2;
- Docker Engine with Docker Compose v2 for the default stack;
- a public HTTPS reverse proxy such as nginx when connecting ChatGPT directly;
- an OAuth 2.1 authorization server compatible with MCP authorization;
- `curl` and `openssl` for the mTLS helper.

## 1. Clone and create secrets

```sh
git clone https://github.com/s3tupw1zard/opencode-context-relay.git
cd opencode-context-relay
sh ./scripts/generate-env.sh
```

Edit `.env` and set at least:

```dotenv
MCP_PUBLIC_URL=https://context.example.com/mcp
OAUTH_ISSUER=https://auth.example.com
OAUTH_ALLOWED_SUBJECT=your-stable-oauth-subject
```

The generated database passwords are independent random hex values.

## 2. Start PostgreSQL, run migrations and start the ChatGPT bridge

```sh
docker compose --env-file .env -f deploy/compose.yaml up -d --build
```

The one-shot `migrate` service:

- creates the `context_bridge` schema when necessary;
- applies only missing migration files;
- records SHA-256 checksums in `context_bridge.schema_migrations`;
- refuses to continue if an already-applied migration file was modified;
- creates/updates the dedicated writer and reader roles;
- reapplies least-privilege grants and RLS policies.

Inspect it with:

```sh
docker compose --env-file .env -f deploy/compose.yaml logs migrate
```

No manual `psql -f ...` sequence is required for the normal Compose setup.

## 3. Install the OpenCode plugin

Once the npm prerelease is published:

```sh
opencode plugin add opencode-context-relay@latest
```

The unversioned package resolves through npm's `latest` dist-tag. This project intentionally moves `latest` to the newest published build, including development prereleases, until a different release-channel policy is documented.

The OpenCode process needs the writer connection string. For a shell-launched OpenCode instance:

```sh
set -a
. ./.env
set +a

export BRIDGE_DATABASE_URL="postgresql://context_bridge_writer:${CONTEXT_BRIDGE_WRITER_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-context_bridge}"
export BRIDGE_DATABASE_SCHEMA=context_bridge

opencode
```

For a service-managed OpenCode instance, set those variables in its service environment instead.

The ChatGPT bridge never uses this writer credential. It receives only `context_bridge_reader`.

## 4. Configure nginx and OpenAI mTLS

Install the OpenAI CA bundle:

```sh
sudo sh ./scripts/update-openai-mtls-ca.sh
```

Then use:

- `deploy/nginx/http-mtls-maps.conf` inside nginx's `http {}`;
- `deploy/nginx/context-bridge.conf` as the generic site example.

Read [mTLS](mtls.md) before enabling the public endpoint.

## 5. Configure OAuth and connect ChatGPT

The MCP service exposes protected-resource discovery and expects an OAuth access token for `context.read`.

Configure your OAuth provider with the exact callback/client-registration method shown by ChatGPT and ensure the issued token is valid for `MCP_PUBLIC_URL`.

Then connect:

```text
https://context.example.com/mcp
```

in ChatGPT developer/plugin tooling and complete OAuth.

## External PostgreSQL instead of the bundled container

The migration system does not depend on the Compose PostgreSQL service. With `psql`, `sha256sum` and admin credentials available:

```sh
export PGHOST=db.internal
export PGPORT=5432
export PGDATABASE=context_bridge
export PGUSER=postgres
export PGPASSWORD='admin-password'
export CONTEXT_BRIDGE_WRITER_PASSWORD='writer-password'
export CONTEXT_BRIDGE_READER_PASSWORD='reader-password'

sh ./database/migrate.sh
```

Prefer a private network. [Deployment topologies](deployment-topologies.md) includes a Tailscale example.

## Optional PostgreSQL bind mount

The default Compose file uses a Docker-managed named volume:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
```

If you prefer the database files to live visibly next to the Compose file, comment out that line and enable the included bind-mount example:

```yaml
volumes:
  # - postgres_data:/var/lib/postgresql/data
  - ./postgres_data:/var/lib/postgresql/data
```

Because the Compose file lives in `deploy/`, that path resolves to:

```text
deploy/postgres_data/
```

Create the directory before the first start:

```sh
mkdir -p deploy/postgres_data
```

If PostgreSQL reports permission errors, let the same PostgreSQL image assign the directory to its internal `postgres` user:

```sh
docker run --rm --user 0:0 \
  -v "$PWD/deploy/postgres_data:/var/lib/postgresql/data" \
  postgres:17 \
  sh -c 'chown -R postgres:postgres /var/lib/postgresql/data'
```

Then start the stack normally:

```sh
docker compose --env-file .env -f deploy/compose.yaml up -d --build
```

Do not enable both the named-volume and bind-mount entries for the same container path at the same time.

A bind mount can make manual host migration more convenient, but logical `pg_dump` backups are still recommended for moving PostgreSQL data between systems or versions.

## Backup before upgrades

```sh
sh ./scripts/backup-postgres.sh
```

Restore with:

```sh
sh ./scripts/restore-postgres.sh path/to/context_bridge.dump
```

Named Docker volumes are the default, but logical PostgreSQL dumps keep host migrations straightforward.

## Releases

See [Releasing](releasing.md) for the CalVer/SemVer scheme and the policy that npm `latest` always points to the newest published build, including prereleases.

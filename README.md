# OpenCode Context Relay

> ⚠️ **Work in progress / early development**
>
> This project is under active development and has **not yet received sufficient real-world testing**. APIs, configuration, database migrations, MCP behavior and stored context formats may change between development releases. Keep backups and review upgrades before relying on it for important or production workloads.

OpenCode Context Relay connects OpenCode's live project context to ChatGPT without exposing raw source code, prompts or terminal transcripts.

It is now one repository because the producer, database schema and ChatGPT reader must evolve together.

```text
OpenCode
   |
   | opencode-context-relay (npm)
   | writer role
   v
PostgreSQL / context_bridge schema
   ^
   | reader role
   |
ChatGPT MCP bridge
   ^
   | OAuth 2.1 + OpenAI-managed mTLS
   |
ChatGPT
```

## Components

- **`packages/opencode-context-relay`** — public OpenCode v2 server + TUI plugin, published together as `opencode-context-relay`.
- **`services/chatgpt-bridge`** — read-only MCP resource server for ChatGPT.
- **`database`** — canonical schema migrations plus dedicated writer/reader roles.
- **`deploy`** — Docker Compose and generic nginx examples.
- **`docs`** — installation, deployment topologies, security and mTLS guidance.

The old repositories were migrated into this monorepo. Their original source snapshots remain under `database/legacy-*` and `docs/{opencode,chatgpt}` while the consolidated layout is being validated.

## Current development version

```text
2026.1.0-dev.8
```

The npm package, ChatGPT bridge service and database schema are intended to move on one release train.

## Quickstart

The normal deployment does **not** require a local clone of this repository.

### 1. Download only Compose and the environment template

```sh
mkdir -p opencode-context-relay
cd opencode-context-relay

curl -fsSL \
  https://raw.githubusercontent.com/s3tupw1zard/opencode-context-relay/main/deploy/compose.yaml \
  -o docker-compose.yaml

curl -fsSL \
  https://raw.githubusercontent.com/s3tupw1zard/opencode-context-relay/main/.env.example \
  -o .env
```

The downloaded Compose setup follows the stable `latest` image tag by default. To use a development build instead, set `CONTEXT_RELAY_VERSION=dev` or an exact development version such as `2026.1.0-dev.8` in `.env` before pulling the images.

Generate a unique password for each database password variable. Run `openssl rand -hex 32` once per variable and paste each generated value into `.env`:

```sh
openssl rand -hex 32
```

Use separate generated values for:

```dotenv
POSTGRES_ADMIN_PASSWORD=...
CONTEXT_BRIDGE_WRITER_PASSWORD=...
CONTEXT_BRIDGE_READER_PASSWORD=...
```

Then set `MCP_PUBLIC_URL`, `OAUTH_ISSUER` and the OAuth subject settings.

### 2. Start the prebuilt stack

```sh
docker compose pull
docker compose up -d
```

By default Compose uses:

```text
postgres:17
ghcr.io/s3tupw1zard/opencode-context-relay-migrator:latest
ghcr.io/s3tupw1zard/opencode-context-relay-chatgpt:latest
```

The migrator image already contains the migration files belonging to that release. It verifies applied migration checksums against the database and exits after the schema and roles are current.

For development builds, set `CONTEXT_RELAY_VERSION=dev`. To pin a specific development release, use an exact version such as `CONTEXT_RELAY_VERSION=2026.1.0-dev.8`.

### 3. Install the OpenCode plugin

```sh
opencode plugin add opencode-context-relay@latest
```

Use `opencode-context-relay@dev` or an exact development version only when intentionally testing a development release.

The same npm package provides both the server plugin and its TUI health integration. When PostgreSQL is unavailable, misconfigured, missing the relay schema, or publishing fails, OpenCode can surface a Context Relay toast; recovery is reported once the connection becomes healthy again.

Provide the OpenCode process with the writer connection:

```sh
set -a
. ./.env
set +a

export BRIDGE_DATABASE_URL="postgresql://context_bridge_writer:${CONTEXT_BRIDGE_WRITER_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-context_bridge}"
export BRIDGE_DATABASE_SCHEMA=context_bridge
```

The ChatGPT bridge receives only `context_bridge_reader`.

The ChatGPT service is also published as the standalone npm package `opencode-context-relay-chatgpt` for users who prefer running it directly with Node instead of Docker.

### 4. Configure the public MCP edge

For a cloned development checkout, the repository includes nginx and mTLS helpers under `deploy/nginx/` and `scripts/`. For repo-free deployments, download those individual files from the matching Git tag/release before exposing the endpoint.

Read [OpenAI-managed mTLS](docs/mtls.md).

### 5. Configure OAuth for ChatGPT

Create an OAuth/OIDC client in your identity provider and enter its endpoints, scopes, client ID and client secret in ChatGPT's custom MCP server settings.

Provider-specific examples for Pocket ID, authentik and Keycloak are documented in [OAuth setup for ChatGPT](docs/oauth-setup.md).

### 6. Connect ChatGPT

The MCP endpoint is normally:

```text
https://context.example.com/mcp
```

The service implements protected-resource discovery and verifies OAuth tokens as a resource server. The reverse proxy validates the OpenAI-managed client certificate chain; the application additionally validates the expected SAN when trusted proxy mTLS headers are enabled.

## Database roles

### `context_bridge_writer`

Used only by the OpenCode relay.

Allowed:

- `SELECT`
- `INSERT`
- `UPDATE`
- required sequence usage

Not granted:

- `DELETE`
- schema ownership
- superuser
- role/database creation
- `BYPASSRLS`
- migration-table access

### `context_bridge_reader`

Used only by the ChatGPT MCP bridge.

It receives explicit column-level `SELECT` grants and read-only RLS policies. It has no write permissions, no access to `browser_context`, no `work_events.details`, and no migration-table access.

## Default deployment philosophy

The documented default assumes OpenCode itself runs on the same machine:

```text
nginx -> 127.0.0.1:8787 -> ChatGPT bridge
OpenCode -> 127.0.0.1:5432 -> PostgreSQL
```

Only nginx needs to be publicly reachable.

Other supported examples include:

- PostgreSQL on a second host connected with **Tailscale**;
- a separate public edge reverse proxy over a private network;
- OpenAI Secure MCP Tunnel for private development use.

See [deployment topologies](docs/deployment-topologies.md).

## Backups

The default uses a named Docker volume rather than a bind-mounted PostgreSQL data directory.

Create a logical backup:

```sh
sh ./scripts/backup-postgres.sh
```

Restore it:

```sh
sh ./scripts/restore-postgres.sh context_bridge-YYYYMMDD-HHMMSS.dump
```

This keeps moving the stack between hosts straightforward without depending on PostgreSQL's physical data-directory layout.

## Documentation

- [Installation](docs/installation.md)
- [OpenAI-managed mTLS](docs/mtls.md)
- [OAuth setup for ChatGPT](docs/oauth-setup.md)
- [Deployment topologies](docs/deployment-topologies.md)
- [Releasing and npm channel policy](docs/releasing.md)
- [OpenCode architecture notes](docs/opencode/architecture.md)
- [ChatGPT bridge architecture](docs/chatgpt/architecture.md)
- [ChatGPT bridge security model](docs/chatgpt/security.md)

## License

AGPL-3.0-only.

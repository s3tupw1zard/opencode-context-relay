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

- **`packages/opencode-context-relay`** — public OpenCode v2 plugin, published as `opencode-context-relay`.
- **`services/chatgpt-bridge`** — read-only MCP resource server for ChatGPT.
- **`database`** — canonical schema migrations plus dedicated writer/reader roles.
- **`deploy`** — Docker Compose and generic nginx examples.
- **`docs`** — installation, deployment topologies, security and mTLS guidance.

The old repositories were migrated into this monorepo. Their original source snapshots remain under `database/legacy-*` and `docs/{opencode,chatgpt}` while the consolidated layout is being validated.

## Current development version

```text
2026.1.0-dev.6
```

The npm package, ChatGPT bridge service and database schema are intended to move on one release train.

## Quickstart

### 1. Create local secrets

```sh
git clone https://github.com/s3tupw1zard/opencode-context-relay.git
cd opencode-context-relay
sh ./scripts/generate-env.sh
```

Edit `.env` and set your public MCP URL and OAuth settings.

### 2. Start PostgreSQL, migrations and the ChatGPT bridge

```sh
docker compose --env-file .env -f deploy/compose.yaml up -d --build
```

The normal setup requires **no manual schema import**. The one-shot migration service applies missing migrations, records checksums and provisions the two database roles.

### 3. Install the OpenCode plugin

After the npm prerelease is published:

```sh
opencode plugin add opencode-context-relay@latest
```

Provide the OpenCode process with the writer connection:

```sh
set -a
. ./.env
set +a

export BRIDGE_DATABASE_URL="postgresql://context_bridge_writer:${CONTEXT_BRIDGE_WRITER_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-context_bridge}"
export BRIDGE_DATABASE_SCHEMA=context_bridge
```

The ChatGPT service uses only `context_bridge_reader`; it never receives the writer password.

### 4. Configure the public MCP edge

Prepare OpenAI's current connector CA bundle:

```sh
sudo sh ./scripts/update-openai-mtls-ca.sh
```

Then adapt:

```text
deploy/nginx/http-mtls-maps.conf
deploy/nginx/context-bridge.conf
```

The examples contain no project-specific domain, VPN or proxy assumptions.

Read [OpenAI-managed mTLS](docs/mtls.md) before exposing the endpoint.

### 5. Connect ChatGPT

The MCP endpoint is normally:

```text
https://context.example.com/mcp
```

The service implements protected-resource discovery and verifies the OAuth token as a resource server. The reverse proxy verifies the OpenAI-managed client-certificate chain; the application additionally verifies the expected SAN when trusted proxy mTLS headers are enabled.

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
- [Deployment topologies](docs/deployment-topologies.md)
- [Releasing and npm `latest` policy](docs/releasing.md)
- [OpenCode architecture notes](docs/opencode/architecture.md)
- [ChatGPT bridge architecture](docs/chatgpt/architecture.md)
- [ChatGPT bridge security model](docs/chatgpt/security.md)

## License

AGPL-3.0-only.

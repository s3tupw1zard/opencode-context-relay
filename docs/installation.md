# Installation

> **Work in progress / early development.** APIs, schema details and deployment behavior can change between `2026.1.0-dev.x` releases. Keep backups and review upgrades before using this with important data.

The normal deployment requires only a Compose file and `.env`. Cloning the repository is optional and mainly useful for development or local builds.

## Prerequisites

- Docker Engine with Docker Compose v2 for the default stack;
- OpenCode v2 for the producer plugin;
- a public HTTPS reverse proxy such as nginx when connecting ChatGPT directly;
- an OAuth 2.1 authorization server compatible with MCP authorization.

## 1. Download Compose and the environment template

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

Set `MCP_PUBLIC_URL`, `OAUTH_ISSUER` and your OAuth subject settings as well.

## 2. Start the prebuilt stack

```sh
docker compose pull
docker compose up -d
```

The default stack pulls:

```text
postgres:17
ghcr.io/s3tupw1zard/opencode-context-relay-migrator:latest
ghcr.io/s3tupw1zard/opencode-context-relay-chatgpt:latest
```

The migrator image contains the exact SQL migrations and role definitions for its release. It applies only missing migrations, records SHA-256 checksums in PostgreSQL and exits.

No repository clone and no runtime download of migration SQL from a moving branch are required.

For development builds, set:

```dotenv
CONTEXT_RELAY_VERSION=dev
```

To pin a specific development release, use an exact version such as:

```dotenv
CONTEXT_RELAY_VERSION=2026.1.0-dev.8
```

## 3. Install the OpenCode producer

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

## 4. ChatGPT bridge without Docker

Docker is optional for the MCP service. The same bridge is also published on npm:

```sh
npm install -g opencode-context-relay-chatgpt@latest
opencode-context-relay-chatgpt
```

It uses the same environment variables as the container.

## 5. Reverse proxy and mTLS

The repository includes generic nginx and OpenAI-mTLS helpers. For a repo-free deployment, download the matching files from the same Git tag as your pinned `CONTEXT_RELAY_VERSION`, or use `main` only when intentionally following the moving WIP channel.

See [OpenAI-managed mTLS](mtls.md).

## 6. Local clone / development mode

Clone only if you want to build or modify the project locally:

```sh
git clone https://github.com/s3tupw1zard/opencode-context-relay.git
cd opencode-context-relay
```

The Compose file contains commented local `build:` and migration bind-mount examples. When enabling those, comment out the corresponding published-image behavior as documented in the file.

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

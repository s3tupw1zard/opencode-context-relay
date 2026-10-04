# ChatGPT bridge

> ⚠️ **Work in progress / insufficiently tested.** This service is part of the `2026.1.0-dev.x` release train.

Read-only MCP resource server that exposes the structured context produced by `opencode-context-relay` to ChatGPT.

## Security model

- dedicated PostgreSQL login: `context_bridge_reader`;
- explicit column-level SELECT grants;
- no database writes;
- OAuth 2.1 resource-server verification;
- optional trusted-proxy validation of OpenAI-managed mTLS client-certificate SAN;
- no generic SQL tool;
- no source-code reader;
- no agent-control/write actions.

The bridge queries the `context_bridge` schema by default.

## Normal deployment

Use the root Compose stack:

```sh
docker compose --env-file .env -f deploy/compose.yaml up -d --build
```

The service itself listens on port 8787 inside the container. The default Compose mapping binds it only to `127.0.0.1` on the host.

For public ChatGPT access, put the generic nginx configuration from `deploy/nginx/` in front of it and follow [the mTLS guide](../../docs/mtls.md).

## Development

From this directory:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

See the root [installation guide](../../docs/installation.md) and [deployment topologies](../../docs/deployment-topologies.md).

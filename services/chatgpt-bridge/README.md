# Context Bridge for ChatGPT

Private, executable read-only MCP consumer for the existing Coding Agent Context
Bridge. OpenCode's publisher remains in `s3tupw1zard/opencode-context-bridge`.

Twelve read-only tools cover current context, session lifecycle and structured history.

- TypeScript + official MCP SDK, stateless Streamable HTTP, native tool calls.
- Existing self-hosted Supabase/PostgreSQL via a dedicated PostgreSQL reader.
- OAuth resource server, subject restriction, protected-resource discovery.
- Multiple projects/sessions, freshness-aware aggregation, bounded typed outputs.
- No UI, SQL/admin tools, writes, source-code reader or agent control.

Start: `npm ci`, fill `.env` from `.env.example`, `npm run build`, `npm start`.
Local port 8787; expose your chosen HTTPS `/mcp` through your existing proxy.

[Architecture](docs/architecture.md) · [Tools](docs/tools.md) ·
[Security](docs/security.md) · [Supabase/rights](docs/self-hosted.md) ·
[Development/deployment/ChatGPT connection](docs/deployment.md)

`npm run typecheck && npm run lint && npm test && npm run build`

Production setup still requires database reader provisioning, backend connectivity,
Pocket ID configuration and a deployed HTTPS endpoint. None are silently
performed on an unknown production database. No API keys belong in Git.

Official references checked 2026-10-01:

- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
- https://supabase.com/docs/guides/database/postgres/roles

## Version 0.2.0: producer Context Model v2

Continues the existing v1 server with five bounded history tools, structured Git/decision/diagnostic/check summaries, session metadata/lifecycle and nine-table schema health. See [v2 contract](docs/context-model-v2.md), [Pocket ID setup](docs/pocket-id.md), [manual DB setup](docs/self-hosted.md) and [deployment](docs/deployment.md). Canonical producer source is pinned, not recreated independently. No production schema writes or deployment run automatically.

The twelve read-only tools are `list_projects`, `get_project_status`, `get_active_sessions`, `get_current_context`, `get_recent_events`, `get_project_changes`, `health`, `get_session_history`, `get_activity_timeline`, `get_decisions`, `get_diagnostics`, `get_validation_runs`.

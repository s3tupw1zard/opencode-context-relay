# Architecture and v2 publisher compatibility

Coding agents → opencode-context-bridge → existing self-hosted Supabase/PostgreSQL → PostgresStorage → ContextService → MCP → ChatGPT. Version 0.2.0 retains the executable v1 architecture and existing seven tool names, adding five targeted history tools without UI or agent control.

Canonical producer commit: `d8424848754bf1c5d1e7ed07d94c571e3652431a`, PR #1, branch `feat/richer-context-model`. See [data contract](context-model-v2.md) and the vendored canonical schema/provenance in sql/. Producer owns publishing, semantic compression, history append/dedup and schema evolution. Consumer owns typed allowlists, bounded read queries, selection, authentication and output privacy. GitHub remains the exact-code/diff source.

## Multi-project/session semantics

Project ID is never inferred from labels. Selectors match exact project_id, label or repository; exactly one is allowed. Duplicate labels/repositories return `ambiguous_project` with at most twenty candidates. Identity is `(project_id,session_id)`.

Current snapshot loads state/runtime/metadata in a bounded repeatable-read read-only transaction. Latest state/runtime timestamp controls status and Git metadata, ties favor runtime; newer metadata last-seen/status fields are reconciled. Semantic context keeps its independent timestamp. Metadata-only sessions remain visible. First/last-seen and explicit closed values distinguish lifecycle from freshness. The producer currently does not write closed_at. Closed sessions do not contribute active counts/blocking; later recorded activity reopens them.

Freshness defaults to fifteen minutes; timestamps more than one minute in the future are stale. Activity is not an authoritative process heartbeat. Fresh open sessions aggregate blocked > working > idle; otherwise all closed yields closed, other combinations stale. Current context ranks open before closed, fresh before stale, blocked > working > idle, latest activity then session ID. Explicit session ID selects exactly that session; no synthetic merged summary is invented.

## Storage and limits

Storage exposes snapshot, checkSchema, events, sessionHistory, activity, decisions, diagnostics, validations and close. Snapshot only loads current tables (default 1000 rows each, maximum 5000); exceeding capacity fails closed. Each history request pushes project/session/time/filter predicates and ordering into PostgreSQL with explicit columns and limit+1, default twenty/maximum fifty. History cursor retains microseconds plus bigint tie-breaker. Work events retain the old ID cursor; project/session lists retain their existing ordered cursors. Grouped diagnostics count only an explicit at-most-seven-day window. No arbitrary table/SQL/URL is supplied by the model.

## Deployment boundaries

ChatGPT reaches the public HTTPS edge and existing Pocket ID authorization server. Caddy forwards the original Host to the private MCP listener on port 8787, locally or over NetBird. MCP reaches PostgreSQL via its restricted internal reader connection. ChatGPT does not join NetBird; Supabase's API gateway is not the MCP endpoint. Host/origin validation does not trust spoofed Forwarded headers to change the configured resource. No broad CORS allowance is introduced.

Default private operation restricts JWT sub to the owner. Explicit shared-backend opt-in grants every correctly authorized resource user access to the same rows; it is not per-user isolation. Real multi-user isolation requires a trusted subject/workspace mapping and scoped database policies. Future publishers must preserve the allowlisted contract and stable namespaced IDs.

# Architecture

## Responsibilities

### GitHub — exact state

GitHub is the authoritative copy of code and history. Semantic snapshots carry read-only `repository`, `branch` and `head_commit` metadata so ChatGPT can fetch exact files/history only when a question requires them.

### PostgreSQL — working memory

PostgreSQL is the deliberately compact structured relay. It stores:

- latest semantic state (`agent_state`)
- throttled live status (`agent_runtime`)
- session lifecycle/history
- meaningful events, decisions, diagnostics and validation summaries

It does **not** store source files, raw diffs, terminal transcripts or prompts.

### OpenCode plugin — observer + publisher

The native v2 plugin:

1. observes tool/session lifecycle events,
2. publishes throttled low-detail runtime state,
3. exposes `bridge_publish_context` as a direct model-visible, strictly structured tool for semantic context,
4. injects a stable v2 session-context reminder so the active coding model publishes semantic checkpoints automatically,
5. reads safe Git metadata for correlation with repository state,
6. records sanitized structured history when enabled.

The plugin does not stage, commit, push or otherwise mutate Git state. Git workflow automation is intentionally outside this repository's scope.

The active coding model supplies the *meaning* of the current work while deterministic code supplies safe branch/HEAD/changed-path metadata.

## Why the coding model writes the summary

A separate summarizer would either need a second model call or access to raw transcripts/diffs. OpenCode's active model already understands the feature, reasoning and decisions. Giving it a narrow structured publishing tool produces higher-value context while reducing data exposure. The reminder is injected into the transient model request only; it does not persist or copy the user's prompt, transcript, source code or tool output into PostgreSQL.

## Query pattern for ChatGPT

Use the smallest useful layer:

1. `agent_runtime` for “what is it doing right now?”
2. `agent_state` for “what is the current approach and why?”
3. structured history for “what happened before this?”
4. GitHub only for questions requiring exact implementation details.

This keeps latency and context usage low.

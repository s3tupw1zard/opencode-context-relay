# Context contract v2

The bridge keeps three distinct layers of context:

1. **Live runtime** — what the session is doing now (`agent_runtime`).
2. **Current semantic state** — the latest compact summary (`agent_state`).
3. **Structured history** — append-only snapshots and safe events for temporal questions.

Raw prompts, raw tool input/output, terminal logs, source code and full diffs never belong in the context database.

## Project and session identity

The bridge supports several OpenCode projects and sessions at the same time.

- `project_id` is OpenCode's native `session.projectID` and is the technical isolation key.
- `project_label` is human-readable and may be overridden per project.
- `session_id` keeps parallel sessions inside one project independent.
- every historical row is scoped by both project and session.

## Current state

A semantic snapshot should answer:

1. **What is the agent trying to accomplish?** — `goal`, `current_task`
2. **Why this approach?** — `reason`, `approach_summary`, `decisions`, `decision_details`
3. **What materially changed?** — `recent_progress`, safe `changed_files`, `git_stats`
4. **What is wrong or unresolved?** — `current_problem`, `problem_severity`, `diagnostics`
5. **What validation has run?** — `checks`
6. **What happens next?** — `next_step`

`rolling_summary` remains compact session memory. Rewrite it as work evolves; do not turn it into a raw chronological log.

## Rich structured fields

### `decision_details`

Optional decision objects complement the legacy `decisions: string[]` field:

```json
{
  "decision": "Keep DTO mapping inside integrations/pelican",
  "rationale": "Presentation should only consume application models",
  "state": "active"
}
```

Allowed state values are `active` and `superseded`.

### `diagnostics`

Structured blocker/error summaries:

```json
{
  "summary": "One widget test still expects the transport DTO",
  "severity": "minor",
  "category": "test",
  "source": "widget test suite",
  "retry_count": 1
}
```

Do not paste stack traces or raw command output.

### `checks`

Structured validation summaries:

```json
{
  "kind": "test",
  "name": "server_overview widget tests",
  "status": "failed",
  "summary": "1 assertion still expects the old DTO shape",
  "passed": 41,
  "failed": 1,
  "skipped": 0,
  "duration_ms": 18420
}
```

Kinds: `test`, `build`, `lint`, `typecheck`, `validation`.
Statuses: `passed`, `failed`, `partial`, `skipped`.

## Deterministic Git metadata

The plugin adds Git state itself. The model must not invent it.

`git_stats` contains only aggregate metadata:

- changed/staged/unstaged/untracked counts
- added/modified/deleted/renamed/conflicted counts
- ahead/behind counts relative to the upstream branch when available
- aggregate insertion/deletion counts from Git numstat

No patch or diff content is stored.

## Historical tables

### `session_metadata`

Tracks first/last seen timestamps and the latest lightweight session state.

### `session_snapshots`

Append-only copies of sanitized semantic snapshots. This enables questions such as:

- What changed over the last hour?
- How did the approach evolve?
- What was the state before the current blocker?

### `activity_events`

Stores safe tool/session metadata only:

- tool name
- broad category (`read`, `write`, `search`, `execution`, `integration`, `other`)
- safe path hints
- success/error outcome
- duration

It never stores tool arguments or results.

### `decision_log`

Deduplicates decisions by a content fingerprint per project/session and retains first/last-seen timestamps plus optional rationale.

### `diagnostic_events`

Append-only structured diagnostic occurrences. Repeated occurrences can be aggregated by `diagnostic_key` at query time.

### `validation_runs`

Append-only test/build/lint/typecheck/validation summaries.

## Size targets

Current state stays deliberately compact even though the self-hosted database has more storage:

- runtime: a small glanceable row
- semantic state: normally 500–2000 tokens
- rolling summary: <= 12,000 characters
- recent progress/decisions: <= 20 entries each
- structured decisions/diagnostics/checks: <= 12 entries each per publication

The increased storage budget is used for structured history, not for dumping raw logs.

## Configuration

`historyEnabled` controls semantic/history tables and defaults to `true` on this branch.

`activityHistoryEnabled` controls tool/session activity history and defaults to `true`.

They can be overridden globally, per project, via plugin options, or with:

```text
BRIDGE_HISTORY_ENABLED=false
BRIDGE_ACTIVITY_HISTORY_ENABLED=false
```

For a fresh deployment apply `postgres/schema.sql`. Existing PR #1 test databases can be migrated or recreated before switching the publisher to the PostgreSQL backend.

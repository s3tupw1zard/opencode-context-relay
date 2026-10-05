# MCP tool contract

All tools are authenticated, read-only, idempotent and return a typed JSON
`structuredContent.result` plus the same content as text. Output schemas are
advertised in tools/list. All tool inputs are strict and unknown keys rejected.

| Tool                | Input                                              | Output                                                 |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| list_projects       | limit?, cursor?                                    | compact projects, next_cursor                          |
| get_project_status  | project                                            | aggregate project                                      |
| get_active_sessions | project?, limit?, cursor?                          | session metadata, next_cursor                          |
| get_current_context | project, session_id?                               | selected session, semantic context, context_updated_at |
| get_recent_events   | project, session_id?, event_type?, limit?, cursor? | event metadata/summary, next_cursor                    |
| get_project_changes | project, session_id?, limit?, cursor?              | per-session safe Git metadata, next_cursor             |
| health              | {}                                                 | server, storage, schema, version                       |

`project` is exactly one of `{project_id}`, `{project_label}`, `{repository}`.
All optional strings are bounded. Event type is checkpoint/blocker/decision/milestone.
List defaults 20 and hard maximum 50. Event cursor is a positive decimal ID.
Dates originate in validated ISO-8601 DB timestamps; the adapter normalizes PG Date
objects into ISO strings. Semantic lists cap at 6, text at 1800 chars, changed_files
at 30 paths. Sensitive values become null or excluded paths.

Expected failures are explicit codes: project_not_found, ambiguous_project,
session_not_found, context_not_found, storage_unavailable, schema_incompatible,
capacity_exceeded, internal_error. Infrastructure exceptions never reach callers.
Backend failures use isError=true. Selector failures return structured results so
ChatGPT can clarify. HTTP authorization failures return 401 before any storage read.
health reads both state/runtime and an events probe; empty databases are compatible
when columns/permissions are valid. It never returns credentials, URLs or raw errors.

## v2 history contracts

All five tools require `project` (exactly one of project_id/project_label/repository), accept optional session_id, limit 1–50 (default 20), opaque cursor, inclusive since and exclusive until. Outputs remain `{result: ...}` and include next_cursor. Unknown project/session or ambiguous project returns a compact safe error/candidates. Input objects are strict.

| Tool                  | Result list     | Extra filters                        |
| --------------------- | --------------- | ------------------------------------ |
| get_session_history   | snapshots       | none                                 |
| get_activity_timeline | activity        | category, event_type                 |
| get_decisions         | decisions       | state active/superseded              |
| get_diagnostics       | diagnostics     | category, severity, group_by_problem |
| get_validation_runs   | validation_runs | kind, status                         |

Grouping diagnostics requires both since/until and at most seven days. See context-model-v2.md for publication-count semantics. Old tools retain their names; their existing project/session cursors remain unchanged. Project status now includes latest activity, latest validation and fresh-session blocker. Context/changes include allowlisted Git aggregates. Context includes allowlisted structured decisions/diagnostics/checks, maximum six of each. Health includes context_model=2 and schema compatibility.

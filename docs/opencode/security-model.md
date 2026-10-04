# Security model

## Allowed data

The bridge may publish compact, structured metadata such as:

- project/session identifiers
- repository identifier
- branch and HEAD commit SHA
- dirty-state and changed-path aggregates
- current status/action
- semantic goal/task/reason/approach
- bounded progress, decisions, diagnostics and validation summaries
- timestamps and session lifecycle metadata

## Forbidden data

Do not publish:

- source code
- full diffs
- raw terminal output
- raw tool arguments/results
- prompts/transcripts
- credentials, tokens, cookies or private keys
- `.env` contents
- unrestricted filesystem content

## Git boundary

Git inspection is read-only and exists only to correlate semantic context with repository state.

The plugin must never:

- stage files,
- create or amend commits,
- reset/rebase history,
- push or force-push,
- automatically edit `.gitignore`,
- instruct the OpenCode session to perform Git mutations on its behalf.

Commit/push workflow policy belongs to a separate workflow plugin. A failure in context publishing must never trigger a Git mutation as recovery.

## Database boundary

Use the dedicated least-privilege writer role from `postgres/roles.sql`. Database credentials remain global configuration/environment only and must never be written to project-local config or logs.

## Logging

Logs may include operation names, safe identifiers, durations, row counts and sanitized error metadata. They must never contain database URLs, passwords, authorization headers, tokens, prompts, source, diffs, or raw tool payloads.

# OpenCode Context Bridge

A private observer/publisher that gives ChatGPT a safe, compact view of what OpenCode is doing while GitHub remains the source of truth for exact code state.

The project is intentionally split into three layers:

- **GitHub** — exact code, branches, commits and diffs.
- **PostgreSQL** — compact semantic working context plus safe Git metadata such as repository, branch, HEAD and dirty-state aggregates.
- **ChatGPT** — conversational/voice interface that combines compact live context with exact repository state only when deeper inspection is needed.

The OpenCode integration targets the current OpenCode v2 plugin API. It observes safe activity metadata and publishes structured context to PostgreSQL.

## Scope boundary

This plugin does **not** own Git workflow automation.

It must never:

- stage files,
- create commits,
- amend/rebase/reset history,
- push branches,
- force-push,
- edit `.gitignore` as part of a Git workflow,
- ask OpenCode to perform any of those actions automatically.

Git is read-only from this plugin's perspective. Repository/branch/HEAD/dirty/changed-file aggregates are collected only as context metadata.

Commit/push workflow automation belongs in a separate plugin such as ScopeLane.

## Goals

- Answer questions such as “What is OpenCode doing right now?”, “What changed recently?” and “Why is it taking this approach?” without shipping raw logs to a third party.
- Track several active OpenCode projects and parallel sessions without state collisions.
- Keep PostgreSQL context compact: semantic summaries, not terminal output or source files.
- Attach semantic snapshots to safe read-only Git metadata so exact code can be resolved through GitHub when needed.
- Avoid a bespoke RAG stack until concrete retrieval failures justify it.

## Data flow

```text
OpenCode v2 (one or more projects/sessions)
   │
   ├── tool/session events (metadata only)
   ▼
opencode-context-bridge
   │
   ├── session → project resolution
   ├── privacy/relevance filtering
   ├── read-only Git metadata
   └── structured context publishing
        │
        ▼
PostgreSQL
        │
        ▼
ChatGPT

GitHub remains a separate source for exact code/history.
```

## Repository layout

```text
src/                    OpenCode v2 plugin and bridge implementation
examples/               OpenCode/global/project config examples
postgres/               Database schema and least-privilege writer role
docs/                   Architecture, security and context contracts
browser-extension/      Reserved for later minimal browser context
```

## Non-negotiable privacy rules

Raw source code, arbitrary shell output, prompts, credentials, cookies, tokens, private keys, `.env` contents and full diffs must **not** be written to PostgreSQL. Prefer an allowlist of semantic fields over redaction-after-the-fact.

See `docs/security-model.md` and `docs/context-schema.md`.

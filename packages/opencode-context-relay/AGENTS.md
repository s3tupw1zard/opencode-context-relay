# Agent instructions

This repository is security-sensitive infrastructure between a coding agent, GitHub, PostgreSQL and ChatGPT.

## Invariants

1. Never send source code, full diffs, arbitrary terminal output, prompts, credentials, cookies, tokens, private keys or `.env` contents to PostgreSQL.
2. Prefer allowlisted structured fields over redaction-after-the-fact.
3. GitHub is the source of truth for exact code. PostgreSQL stores only compact semantic context and safe Git metadata.
4. Git access in this plugin is read-only metadata collection. Never stage, commit, amend, reset, rebase, push, force-push or otherwise mutate repository state.
5. Never add Git workflow automation, automatic checkpoint commits, push orchestration or `.gitignore` mutation to this plugin. Those responsibilities belong to a separate workflow plugin.
6. OpenCode v2 is the primary target. Do not reintroduce v1-only plugin/event APIs without an explicit compatibility layer and tests.
7. Keep the bridge narrow: observe, sanitize, publish and diagnose. Do not add unrelated coding-agent orchestration.

## Context quality

A published context snapshot should explain what the agent is doing, why it is doing it, meaningful recent progress, important decisions, current blockers, the next expected step, and the exact read-only Git branch/HEAD metadata corresponding to the snapshot. Avoid low-value tool-call narration.

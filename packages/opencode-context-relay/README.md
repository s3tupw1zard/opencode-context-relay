# opencode-context-relay

> ⚠️ **Work in progress / insufficiently tested.** This package is a development prerelease. Configuration and storage behavior may change between `2026.1.0-dev.x` builds.

OpenCode v2 plugin that publishes a deliberately small, structured view of active coding work to PostgreSQL for the read-only ChatGPT bridge in the same repository.

It does **not** publish raw source code, full diffs, prompts, terminal transcripts, credentials or arbitrary tool results.

## Install

After publication:

```sh
opencode plugin add opencode-context-relay@dev
```

Development prereleases are published under npm's `dev` dist-tag. Release candidates use `next`; stable releases use `latest`.

## Configure

The simplest same-host setup uses environment variables:

```sh
export BRIDGE_DATABASE_URL='postgresql://context_bridge_writer:PASSWORD@127.0.0.1:5432/context_bridge'
export BRIDGE_DATABASE_SCHEMA=context_bridge
```

Optional variables:

```text
BRIDGE_HISTORY_ENABLED=true
BRIDGE_ACTIVITY_HISTORY_ENABLED=true
BRIDGE_PROJECT_LABEL=
BRIDGE_LOG_LEVEL=info
BRIDGE_LOG_FILE=
```

Database credentials should be global/environment configuration, not project-repository configuration.

## Database permissions

Use the repository's migration/bootstrap system. The plugin is intended to connect as `context_bridge_writer`, which has bounded read/write permissions but no DELETE, ownership, role-management or migration-table access.

See the root [installation guide](../../docs/installation.md).

## Scope boundary

This package observes and publishes context only. It does not own Git workflow automation and must not stage, commit, reset, rebase, push or force-push repository state.

Git workflow automation belongs in tools such as ScopeLane.

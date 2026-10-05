# Setup

## 1. PostgreSQL

The bridge writes directly to PostgreSQL. Supabase/PostgREST and a service-role key are not required.

Apply the schema as a PostgreSQL administrator:

```bash
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f postgres/schema.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f postgres/roles.sql
psql "$ADMIN_DATABASE_URL"
```

Then set the writer password interactively:

```text
\password context_bridge_writer
```

The default database/schema are expected to be `context_bridge`. Keep PostgreSQL private and expose it only to trusted bridge hosts.

## 2. Global plugin config

Create:

```text
~/.config/opencode-context-relay/config.json
```

Example:

```json
{
  "databaseUrl": "postgresql://context_bridge_writer:REPLACE_ME@127.0.0.1:5432/context_bridge",
  "databaseSchema": "context_bridge",
  "historyEnabled": true,
  "activityHistoryEnabled": true,
  "logLevel": "info"
}
```

Protect it because it contains a database credential:

```bash
chmod 600 ~/.config/opencode-context-relay/config.json
```

`$XDG_CONFIG_HOME/opencode-context-relay/config.json` is used when `XDG_CONFIG_HOME` is set. `BRIDGE_CONFIG_PATH` can point to another global config file.

Environment equivalents:

```bash
export BRIDGE_DATABASE_URL='postgresql://context_bridge_writer:...@127.0.0.1:5432/context_bridge'
export BRIDGE_DATABASE_SCHEMA='context_bridge'
export BRIDGE_HISTORY_ENABLED='true'
export BRIDGE_ACTIVITY_HISTORY_ENABLED='true'
export BRIDGE_LOG_LEVEL='info'
# Optional:
# export BRIDGE_LOG_FILE='/var/log/opencode-context-relay/opencode-context-relay.log'
```

Database connection settings are intentionally ignored in project-local config so credentials cannot accidentally be committed with a repository.

## 3. Optional per-project config

A project can override non-secret publishing behavior with:

```text
.opencode/context-bridge.json
```

Example:

```json
{
  "projectLabel": "PeliPocket",
  "historyEnabled": true,
  "activityHistoryEnabled": true,
  "logLevel": "info"
}
```

Configuration priority:

```text
plugin options > project config > global config > environment > defaults
```

Database connection settings and `logFile` skip the project-config layer.

## 4. Diagnostics and plugin log

The plugin writes structured diagnostics to:

```text
$XDG_STATE_HOME/opencode-context-relay/opencode-context-relay.log
```

or, when `XDG_STATE_HOME` is unset:

```text
~/.local/state/opencode-context-relay/opencode-context-relay.log
```

Supported levels are `error`, `warn`, `info`, and `debug`; `info` is the default. Use `debug` temporarily while diagnosing event/session publishing.

```json
{
  "logLevel": "debug"
}
```

Credentials, database URLs, authorization headers, tokens, passwords, prompts, raw tool arguments/results, source code, and diffs must never be written to the log.

At startup the plugin records whether PostgreSQL is configured, whether the connection succeeds, and whether the configured schema contains the expected tables. A `databaseUrl` still containing `REPLACE_ME` is treated as unconfigured.

Useful checks:

```bash
tail -F ~/.local/state/opencode-context-relay/opencode-context-relay.log
```

```sql
\dn
\dt context_bridge.*
```

Plain `\dt` may show no relations when `context_bridge` is not on the current `search_path`.

## 5. Install the plugin

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-context-relay"
  ]
}
```

After updating a GitHub-hosted plugin, refresh OpenCode's installed plugin cache and restart long-running OpenCode processes.

## 6. Structured history

Current live state:

- `agent_runtime` — what the session is doing now
- `agent_state` — latest semantic state

With `historyEnabled=true`, the plugin additionally writes:

- `session_metadata`
- `session_snapshots`
- `decision_log`
- `diagnostic_events`
- `validation_runs`

With `activityHistoryEnabled=true`, it writes safe `activity_events` after tool execution and selected session lifecycle events.

Activity history stores tool names, broad categories, safe path hints, outcome and duration. It never stores raw tool arguments or results.

## 7. Verify publishing

Ask OpenCode to use `bridge.publish_context`. A successful call should return:

```text
Context snapshot published.
```

Verify directly in PostgreSQL:

```sql
select project_id, project_label, session_id, status, current_task, updated_at
from context_bridge.agent_state
order by updated_at desc;

select project_id, session_id, status, current_action, updated_at
from context_bridge.agent_runtime
order by updated_at desc;
```

## Git scope

The bridge reads Git metadata only. It does not expose or implement automatic commit, checkpoint-commit, staging, push, force-push or repository mutation features. Those workflows belong in a separate plugin.

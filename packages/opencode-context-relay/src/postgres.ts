import { createHash } from "node:crypto"
import { Pool, type PoolClient } from "pg"
import type { ActivityCategory } from "./activity.js"
import { hasUsableDatabaseUrl, type BridgeConfig } from "./config.js"
import type { BridgeLogger } from "./logger.js"
import type { ContextSnapshot } from "./context.js"
import type { GitStats } from "./git.js"

export type RuntimeStatus = "working" | "idle" | "blocked"
export type ActivityEventType =
  | "tool_completed"
  | "tool_failed"
  | "session_idle"
  | "session_error"
  | "session_compacted"

export interface RuntimeState {
  project_id: string
  project_label?: string
  session_id: string
  repository?: string
  branch: string
  head_commit?: string
  git_dirty: boolean
  changed_files: string[]
  git_stats: GitStats
  status: RuntimeStatus
  current_action?: string
  updated_at: string
}

export interface ActivityEvent {
  project_id: string
  project_label?: string
  session_id: string
  event_type: ActivityEventType
  category: ActivityCategory | "session"
  tool_name?: string
  paths?: string[]
  outcome?: "success" | "error" | "idle"
  duration_ms?: number
  created_at: string
}

const pools = new Map<string, Pool>()
let postgresLogger: BridgeLogger | undefined

export function setPostgresLogger(logger: BridgeLogger): void {
  postgresLogger = logger
}

function configured(config: BridgeConfig): config is BridgeConfig & { databaseUrl: string } {
  return hasUsableDatabaseUrl(config)
}

function validateSchema(schema: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error("BRIDGE_DATABASE_SCHEMA must be a simple PostgreSQL identifier")
  }
  return schema
}

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function table(config: BridgeConfig, name: string): string {
  return `${identifier(validateSchema(config.databaseSchema))}.${identifier(name)}`
}

function poolFor(config: BridgeConfig & { databaseUrl: string }): Pool {
  const key = `${config.databaseUrl}\0${config.databaseSchema}`
  const existing = pools.get(key)
  if (existing) return existing

  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    application_name: "opencode-context-relay",
  })
  pool.on("error", (error) => {
    postgresLogger?.error("PostgreSQL pool error", { error })
  })
  pools.set(key, pool)
  return pool
}

function stableKey(...parts: Array<string | undefined>): string {
  return createHash("sha256")
    .update(parts.map((part) => part ?? "").join("\0"))
    .digest("hex")
    .slice(0, 32)
}

function dbValue(value: unknown): unknown {
  if (value === undefined) return null
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value)
  return value
}

async function insertRecord(
  client: PoolClient,
  target: string,
  columns: string[],
  record: Record<string, unknown>,
  conflictColumns: string[] = [],
  updateColumns: string[] = [],
): Promise<void> {
  const names = columns.map(identifier).join(", ")
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ")
  const values = columns.map((column) => dbValue(record[column]))

  let conflict = ""
  if (conflictColumns.length > 0) {
    const keys = conflictColumns.map(identifier).join(", ")
    if (updateColumns.length === 0) {
      conflict = ` ON CONFLICT (${keys}) DO NOTHING`
    } else {
      const updates = updateColumns
        .map((column) => `${identifier(column)} = EXCLUDED.${identifier(column)}`)
        .join(", ")
      conflict = ` ON CONFLICT (${keys}) DO UPDATE SET ${updates}`
    }
  }

  await client.query(
    `INSERT INTO ${target} (${names}) VALUES (${placeholders})${conflict}`,
    values,
  )
}

async function inTransaction(
  config: BridgeConfig & { databaseUrl: string },
  action: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const startedAt = Date.now()
  let client: PoolClient
  try {
    client = await poolFor(config).connect()
  } catch (error) {
    postgresLogger?.error("PostgreSQL connection failed", { error })
    throw error
  }

  try {
    await client.query("BEGIN")
    await action(client)
    await client.query("COMMIT")
    postgresLogger?.debug("PostgreSQL transaction committed", {
      duration_ms: Date.now() - startedAt,
      schema: config.databaseSchema,
    })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    postgresLogger?.error("PostgreSQL transaction failed", {
      error,
      duration_ms: Date.now() - startedAt,
      schema: config.databaseSchema,
    })
    throw error
  } finally {
    client.release()
  }
}

export async function checkPostgres(config: BridgeConfig): Promise<
  | { storage: "not_configured"; schema: "unverified" }
  | { storage: "reachable"; schema: "present" | "missing" }
  | { storage: "unavailable"; schema: "unverified" }
> {
  if (!configured(config)) {
    return { storage: "not_configured", schema: "unverified" }
  }

  try {
    const pool = poolFor(config)
    await pool.query("SELECT 1")
    const relation = await pool.query<{ relation: string | null }>(
      "SELECT to_regclass($1) AS relation",
      [`${config.databaseSchema}.agent_state`],
    )
    return {
      storage: "reachable",
      schema: relation.rows[0]?.relation ? "present" : "missing",
    }
  } catch (error) {
    postgresLogger?.error("PostgreSQL connectivity check failed", { error })
    return { storage: "unavailable", schema: "unverified" }
  }
}

const runtimeColumns = [
  "project_id",
  "project_label",
  "session_id",
  "repository",
  "branch",
  "head_commit",
  "git_dirty",
  "changed_files",
  "git_stats",
  "status",
  "current_action",
  "updated_at",
]

const stateColumns = [
  "project_id",
  "project_label",
  "session_id",
  "repository",
  "branch",
  "head_commit",
  "git_dirty",
  "changed_files",
  "git_stats",
  "status",
  "goal",
  "current_task",
  "reason",
  "approach_summary",
  "important_details",
  "recent_progress",
  "decisions",
  "decision_details",
  "diagnostics",
  "checks",
  "current_problem",
  "problem_severity",
  "next_step",
  "rolling_summary",
  "updated_at",
]

async function upsertSessionMetadata(
  client: PoolClient,
  config: BridgeConfig,
  state: Pick<
    RuntimeState,
    | "project_id"
    | "project_label"
    | "session_id"
    | "repository"
    | "branch"
    | "head_commit"
    | "git_dirty"
    | "status"
    | "updated_at"
  >,
): Promise<void> {
  const record = {
    project_id: state.project_id,
    project_label: state.project_label,
    session_id: state.session_id,
    repository: state.repository,
    first_seen_at: state.updated_at,
    last_seen_at: state.updated_at,
    last_status: state.status,
    last_branch: state.branch,
    last_head_commit: state.head_commit,
    last_git_dirty: state.git_dirty,
  }

  await insertRecord(
    client,
    table(config, "session_metadata"),
    [
      "project_id",
      "project_label",
      "session_id",
      "repository",
      "first_seen_at",
      "last_seen_at",
      "last_status",
      "last_branch",
      "last_head_commit",
      "last_git_dirty",
    ],
    record,
    ["project_id", "session_id"],
    [
      "project_label",
      "repository",
      "last_seen_at",
      "last_status",
      "last_branch",
      "last_head_commit",
      "last_git_dirty",
    ],
  )
}

async function publishSnapshotHistory(
  client: PoolClient,
  config: BridgeConfig,
  snapshot: ContextSnapshot,
): Promise<void> {
  const { updated_at, ...snapshotPayload } = snapshot
  await insertRecord(
    client,
    table(config, "session_snapshots"),
    [
      "project_id",
      "project_label",
      "session_id",
      "repository",
      "branch",
      "head_commit",
      "git_dirty",
      "changed_files",
      "git_stats",
      "status",
      "goal",
      "current_task",
      "reason",
      "approach_summary",
      "important_details",
      "recent_progress",
      "decisions",
      "decision_details",
      "diagnostics",
      "checks",
      "current_problem",
      "problem_severity",
      "next_step",
      "rolling_summary",
      "captured_at",
    ],
    { ...snapshotPayload, captured_at: updated_at },
  )

  const decisionRows = new Map<string, Record<string, unknown>>()
  for (const decision of snapshot.decisions) {
    const key = stableKey(decision)
    decisionRows.set(key, {
      project_id: snapshot.project_id,
      project_label: snapshot.project_label,
      session_id: snapshot.session_id,
      decision_key: key,
      decision,
      state: "active",
      branch: snapshot.branch,
      head_commit: snapshot.head_commit,
      first_seen_at: updated_at,
      last_seen_at: updated_at,
    })
  }
  for (const detail of snapshot.decision_details) {
    const key = stableKey(detail.decision)
    decisionRows.set(key, {
      project_id: snapshot.project_id,
      project_label: snapshot.project_label,
      session_id: snapshot.session_id,
      decision_key: key,
      decision: detail.decision,
      rationale: detail.rationale,
      state: detail.state,
      branch: snapshot.branch,
      head_commit: snapshot.head_commit,
      first_seen_at: updated_at,
      last_seen_at: updated_at,
    })
  }

  for (const row of decisionRows.values()) {
    await insertRecord(
      client,
      table(config, "decision_log"),
      [
        "project_id",
        "project_label",
        "session_id",
        "decision_key",
        "decision",
        "rationale",
        "state",
        "branch",
        "head_commit",
        "first_seen_at",
        "last_seen_at",
      ],
      row,
      ["project_id", "session_id", "decision_key"],
      [
        "project_label",
        "decision",
        "rationale",
        "state",
        "branch",
        "head_commit",
        "last_seen_at",
      ],
    )
  }

  const diagnosticRows: Array<Record<string, unknown>> = snapshot.diagnostics.map((diagnostic) => ({
    project_id: snapshot.project_id,
    project_label: snapshot.project_label,
    session_id: snapshot.session_id,
    diagnostic_key: stableKey(
      diagnostic.category,
      diagnostic.severity,
      diagnostic.summary,
      diagnostic.source,
    ),
    category: diagnostic.category,
    severity: diagnostic.severity,
    summary: diagnostic.summary,
    source: diagnostic.source,
    retry_count: diagnostic.retry_count,
    branch: snapshot.branch,
    head_commit: snapshot.head_commit,
    created_at: updated_at,
  }))

  if (
    snapshot.current_problem &&
    !snapshot.diagnostics.some((diagnostic) => diagnostic.summary === snapshot.current_problem)
  ) {
    diagnosticRows.push({
      project_id: snapshot.project_id,
      project_label: snapshot.project_label,
      session_id: snapshot.session_id,
      diagnostic_key: stableKey("current_problem", snapshot.problem_severity, snapshot.current_problem),
      category: "current_problem",
      severity: snapshot.problem_severity ?? "info",
      summary: snapshot.current_problem,
      source: "semantic_context",
      retry_count: undefined,
      branch: snapshot.branch,
      head_commit: snapshot.head_commit,
      created_at: updated_at,
    })
  }

  for (const row of diagnosticRows) {
    await insertRecord(
      client,
      table(config, "diagnostic_events"),
      [
        "project_id",
        "project_label",
        "session_id",
        "diagnostic_key",
        "category",
        "severity",
        "summary",
        "source",
        "retry_count",
        "branch",
        "head_commit",
        "created_at",
      ],
      row,
    )
  }

  for (const check of snapshot.checks) {
    await insertRecord(
      client,
      table(config, "validation_runs"),
      [
        "project_id",
        "project_label",
        "session_id",
        "branch",
        "head_commit",
        "kind",
        "name",
        "status",
        "summary",
        "passed",
        "failed",
        "skipped",
        "duration_ms",
        "created_at",
      ],
      {
        project_id: snapshot.project_id,
        project_label: snapshot.project_label,
        session_id: snapshot.session_id,
        branch: snapshot.branch,
        head_commit: snapshot.head_commit,
        kind: check.kind,
        name: check.name,
        status: check.status,
        summary: check.summary,
        passed: check.passed,
        failed: check.failed,
        skipped: check.skipped,
        duration_ms: check.duration_ms,
        created_at: updated_at,
      },
    )
  }
}

export async function publishSnapshot(
  config: BridgeConfig,
  snapshot: ContextSnapshot,
): Promise<boolean> {
  if (!configured(config)) return false

  await inTransaction(config, async (client) => {
    await insertRecord(
      client,
      table(config, "agent_state"),
      stateColumns,
      snapshot as unknown as Record<string, unknown>,
      ["project_id", "session_id"],
      stateColumns.filter((column) => !["project_id", "session_id"].includes(column)),
    )

    await upsertSessionMetadata(client, config, {
      project_id: snapshot.project_id,
      project_label: snapshot.project_label,
      session_id: snapshot.session_id,
      repository: snapshot.repository,
      branch: snapshot.branch,
      head_commit: snapshot.head_commit,
      git_dirty: snapshot.git_dirty,
      status: snapshot.status,
      updated_at: snapshot.updated_at,
    })

    if (config.historyEnabled) {
      await publishSnapshotHistory(client, config, snapshot)
    }

    if (
      snapshot.recent_progress.length > 0 ||
      snapshot.decisions.length > 0 ||
      snapshot.decision_details.length > 0 ||
      snapshot.diagnostics.length > 0 ||
      snapshot.checks.length > 0 ||
      snapshot.status === "blocked"
    ) {
      await insertRecord(
        client,
        table(config, "work_events"),
        [
          "project_id",
          "project_label",
          "session_id",
          "repository",
          "branch",
          "head_commit",
          "event_type",
          "summary",
          "details",
          "created_at",
        ],
        {
          project_id: snapshot.project_id,
          project_label: snapshot.project_label,
          session_id: snapshot.session_id,
          repository: snapshot.repository,
          branch: snapshot.branch,
          head_commit: snapshot.head_commit,
          event_type: snapshot.status === "blocked" ? "blocker" : "checkpoint",
          summary:
            snapshot.current_task ??
            snapshot.approach_summary ??
            snapshot.goal ??
            "OpenCode context snapshot",
          details: {
            progress: snapshot.recent_progress,
            decisions: snapshot.decisions,
            decision_details: snapshot.decision_details,
            diagnostics: snapshot.diagnostics,
            checks: snapshot.checks.map((check) => ({
              kind: check.kind,
              name: check.name,
              status: check.status,
              passed: check.passed,
              failed: check.failed,
              skipped: check.skipped,
            })),
            problem: snapshot.current_problem,
            next_step: snapshot.next_step,
            git_stats: snapshot.git_stats,
          },
          created_at: snapshot.updated_at,
        },
      )
    }
  })

  return true
}

export async function publishRuntimeState(
  config: BridgeConfig,
  state: RuntimeState,
): Promise<boolean> {
  if (!configured(config)) return false

  await inTransaction(config, async (client) => {
    await insertRecord(
      client,
      table(config, "agent_runtime"),
      runtimeColumns,
      state as unknown as Record<string, unknown>,
      ["project_id", "session_id"],
      runtimeColumns.filter((column) => !["project_id", "session_id"].includes(column)),
    )
    await upsertSessionMetadata(client, config, state)
  })

  return true
}

export async function publishActivityEvent(
  config: BridgeConfig,
  event: ActivityEvent,
): Promise<boolean> {
  if (!configured(config) || !config.activityHistoryEnabled) return false

  const client = await poolFor(config).connect()
  try {
    await insertRecord(
      client,
      table(config, "activity_events"),
      [
        "project_id",
        "project_label",
        "session_id",
        "event_type",
        "category",
        "tool_name",
        "paths",
        "outcome",
        "duration_ms",
        "created_at",
      ],
      { ...event, paths: event.paths ?? [] },
    )
  } finally {
    client.release()
  }

  return true
}

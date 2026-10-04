import pg from "pg";
import { z } from "zod";
import {
  stateSchema,
  runtimeSchema,
  metadataSchema,
  eventSchema,
  historySchema,
  activitySchema,
  decisionSchema,
  diagnosticSchema,
  diagnosticGroupSchema,
  validationSchema,
  SafeError,
  type Snapshot,
  type Event,
} from "../domain/model.js";
import { decodeCursor, encodeCursor } from "./cursor.js";
import type { Storage, Query, Page, SchemaHealth } from "./types.js";
export const tables = {
  agent_state: stateSchema,
  agent_runtime: runtimeSchema,
  session_metadata: metadataSchema,
  work_events: eventSchema,
  session_snapshots: historySchema,
  activity_events: activitySchema,
  decision_log: decisionSchema,
  diagnostic_events: diagnosticSchema,
  validation_runs: validationSchema,
};
type Table = keyof typeof tables;
type Fields = { name: string; dataTypeID: number }[];
export interface SqlResult {
  rows: Record<string, unknown>[];
  fields: Fields;
}
export interface SqlClient {
  query(sql: string, values?: unknown[]): Promise<SqlResult>;
  release(): void;
}
export interface SqlPool {
  query(sql: string, values?: unknown[]): Promise<SqlResult>;
  connect(): Promise<SqlClient>;
  end(): Promise<void>;
  on(event: string, listener: () => void): unknown;
}
const jsonColumns = new Set([
  "changed_files",
  "git_stats",
  "important_details",
  "recent_progress",
  "decisions",
  "decision_details",
  "diagnostics",
  "checks",
  "paths",
]);
const numberColumns = new Set([
  "duration_ms",
  "retry_count",
  "passed",
  "failed",
  "skipped",
]);
function validateSchemaName(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
    throw new Error("Invalid PostgreSQL schema name");
  return value;
}

export function expectedType(column: string) {
  return column === "id"
    ? 20
    : column.endsWith("_at")
      ? 1184
      : jsonColumns.has(column)
        ? 3802
        : numberColumns.has(column)
          ? 23
          : column === "git_dirty" || column === "last_git_dirty"
            ? 16
            : 25;
}
function columns(table: Table) {
  return Object.keys(tables[table].shape);
}
function healthColumns(table: Table) {
  return table === "diagnostic_events"
    ? [...columns(table), "diagnostic_key"]
    : columns(table);
}
function projection(table: Table, alias?: string) {
  return columns(table)
    .map((k) => {
      const col = alias ? `${alias}.${k}` : k;
      return k.endsWith("_at")
        ? `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ${k}`
        : col;
    })
    .join(",");
}
export function normalizeDates(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        v instanceof Date ? v.toISOString() : v,
      ]),
    ),
  );
}
function databaseCode(e: unknown) {
  return e && typeof e === "object" && "code" in e ? String(e.code) : "";
}
function safeDatabaseError(e: unknown) {
  return new SafeError(
    ["42P01", "42703"].includes(databaseCode(e))
      ? "schema_incompatible"
      : "storage_unavailable",
  );
}
function parseRows<T>(
  schema: z.ZodType<T>,
  rows: Record<string, unknown>[],
): T[] {
  const parsed = z.array(schema).safeParse(normalizeDates(rows));
  if (!parsed.success) throw new SafeError("schema_incompatible");
  return parsed.data;
}
export class PostgresStorage implements Storage {
  private pool: SqlPool;
  private schema: string;
  constructor(
    url: string,
    timeout = 5000,
    private rowCap = 1000,
    pool?: SqlPool,
    schema = "context_bridge",
  ) {
    this.schema = validateSchemaName(schema);
    this.pool =
      pool ??
      new pg.Pool({
        connectionString: url,
        max: 4,
        connectionTimeoutMillis: timeout,
        query_timeout: timeout,
        options: `-c default_transaction_read_only=on -c statement_timeout=${timeout}`,
      });
    this.pool.on("error", () => {});
  }
  private relation(table: string) {
    return `"${this.schema}"."${table}"`;
  }

  private async query(sql: string, values: unknown[] = []) {
    try {
      return await this.pool.query(sql, values);
    } catch (e) {
      throw safeDatabaseError(e);
    }
  }
  async snapshot(): Promise<Snapshot> {
    const client = await this.pool.connect().catch(() => {
      throw new SafeError("storage_unavailable");
    });
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const loaded: Record<string, Record<string, unknown>[]> = {};
      for (const table of [
        "agent_state",
        "agent_runtime",
        "session_metadata",
      ] as const) {
        const rows = (
          await client.query(
            `SELECT ${projection(table)} FROM ${this.relation(table)} ORDER BY project_id,session_id LIMIT $1`,
            [this.rowCap + 1],
          )
        ).rows;
        if (rows.length > this.rowCap) throw new SafeError("capacity_exceeded");
        loaded[table] = rows;
      }
      const snapshot = {
        states: parseRows(stateSchema, loaded.agent_state),
        runtime: parseRows(runtimeSchema, loaded.agent_runtime),
        metadata: parseRows(metadataSchema, loaded.session_metadata),
      };
      await client.query("COMMIT");
      return snapshot;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e instanceof SafeError ? e : safeDatabaseError(e);
    } finally {
      client.release();
    }
  }
  async checkSchema(): Promise<SchemaHealth> {
    try {
      for (const table of Object.keys(tables) as Table[]) {
        const result = await this.query(
          `SELECT ${healthColumns(table).join(",")} FROM ${this.relation(table)} LIMIT 0`,
        );
        if (
          result.fields.length !== healthColumns(table).length ||
          result.fields.some(
            (f) =>
              !healthColumns(table).includes(f.name) ||
              f.dataTypeID !== expectedType(f.name),
          )
        )
          return { storage: "reachable", schema: "incompatible" };
      }
      return { storage: "reachable", schema: "compatible" };
    } catch (e) {
      return e instanceof SafeError && e.code === "schema_incompatible"
        ? { storage: "reachable", schema: "incompatible" }
        : { storage: "unavailable", schema: "unverified" };
    }
  }
  async events(
    project: string,
    session: string | undefined,
    type: string | undefined,
    limit: number,
    before?: string,
  ): Promise<Event[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 51)
      throw new SafeError("invalid_limit");
    if (
      before &&
      (!/^\d{1,19}$/.test(before) || BigInt(before) > 9223372036854775807n)
    )
      throw new SafeError("invalid_cursor");
    const values: unknown[] = [project];
    const where = ["project_id=$1"];
    for (const [key, value] of [
      ["session_id", session],
      ["event_type", type],
    ] as const)
      if (value !== undefined) {
        values.push(value);
        where.push(`${key}=$${values.length}`);
      }
    if (before) {
      values.push(before);
      where.push(`id<$${values.length}::bigint`);
    }
    values.push(limit);
    return parseRows(
      eventSchema,
      (
        await this.query(
          `SELECT ${projection("work_events")} FROM ${this.relation("work_events")} WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT $${values.length}`,
          values,
        )
      ).rows,
    );
  }
  private filters(q: Query) {
    if (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > 50)
      throw new SafeError("invalid_limit");
    const values: unknown[] = [q.project_id],
      where = ["project_id=$1"];
    if (q.session_id !== undefined) {
      values.push(q.session_id);
      where.push(`session_id=$${values.length}`);
    }
    return { values, where };
  }
  private async history<T extends { id: string }>(
    table: Table,
    date: string,
    schema: z.ZodType<T>,
    q: Query,
    allowed: string[],
  ): Promise<Page<T>> {
    const { values, where } = this.filters(q);
    for (const field of [
      "category",
      "event_type",
      "state",
      "severity",
      "kind",
      "status",
    ] as const) {
      if (q[field] !== undefined) {
        if (!allowed.includes(field)) throw new SafeError("invalid_filter");
        values.push(q[field]);
        where.push(`${field}=$${values.length}`);
      }
    }
    for (const [value, operator] of [
      [q.since, ">="],
      [q.until, "<"],
    ] as const)
      if (value) {
        values.push(value);
        where.push(`${date}${operator}$${values.length}::timestamptz`);
      }
    const cursor = decodeCursor(table, q);
    if (cursor) {
      values.push(cursor.t, cursor.id);
      where.push(
        `(${date},id)<($${values.length - 1}::timestamptz,$${values.length}::bigint)`,
      );
    }
    values.push(q.limit + 1);
    const rows = parseRows(
      schema,
      (
        await this.query(
          `SELECT ${projection(table)} FROM ${this.relation(table)} WHERE ${where.join(" AND ")} ORDER BY ${date} DESC,id DESC LIMIT $${values.length}`,
          values,
        )
      ).rows,
    );
    const last = rows[q.limit - 1];
    return {
      items: rows.slice(0, q.limit),
      next_cursor:
        rows.length > q.limit
          ? encodeCursor(
              table,
              q,
              String((last as Record<string, unknown>)[date]),
              last.id,
            )
          : null,
    };
  }
  sessionHistory(q: Query) {
    return this.history(
      "session_snapshots",
      "captured_at",
      historySchema,
      q,
      [],
    );
  }
  activity(q: Query) {
    return this.history("activity_events", "created_at", activitySchema, q, [
      "category",
      "event_type",
    ]);
  }
  decisions(q: Query) {
    return this.history("decision_log", "last_seen_at", decisionSchema, q, [
      "state",
    ]);
  }
  validations(q: Query) {
    return this.history("validation_runs", "created_at", validationSchema, q, [
      "kind",
      "status",
    ]);
  }
  async diagnostics(
    q: Query,
  ): Promise<
    Page<
      z.infer<typeof diagnosticSchema> | z.infer<typeof diagnosticGroupSchema>
    >
  > {
    if (!q.group_by_problem)
      return this.history(
        "diagnostic_events",
        "created_at",
        diagnosticSchema,
        q,
        ["severity", "category"],
      );
    // Exact counts within a caller-supplied bounded time window; never count only a page.
    if (
      !q.since ||
      !q.until ||
      !Number.isFinite(Date.parse(q.since)) ||
      !Number.isFinite(Date.parse(q.until)) ||
      Date.parse(q.until) <= Date.parse(q.since) ||
      Date.parse(q.until) - Date.parse(q.since) > 7 * 86400000
    )
      throw new SafeError("invalid_time_range");
    const { values, where } = this.filters(q);
    for (const field of ["severity", "category"] as const)
      if (q[field]) {
        values.push(q[field]);
        where.push(`${field}=$${values.length}`);
      }
    values.push(q.since, q.until);
    where.push(
      `created_at >= $${values.length - 1}::timestamptz AND created_at < $${values.length}::timestamptz`,
    );
    const cursor = decodeCursor("diagnostic_groups", q);
    let cursorWhere = "";
    if (cursor) {
      values.push(cursor.t, cursor.id);
      cursorWhere = `WHERE (g.last_seen_at,g.latest_id)<($${values.length - 1}::timestamptz,$${values.length}::bigint)`;
    }
    values.push(q.limit + 1);
    const sql = `WITH grouped AS (SELECT project_id,session_id,diagnostic_key,count(*)::int AS occurrence_count,min(created_at) AS first_seen_at,max(created_at) AS last_seen_at,(array_agg(id ORDER BY created_at DESC,id DESC))[1] AS latest_id FROM ${this.relation("diagnostic_events")} WHERE ${where.join(" AND ")} GROUP BY project_id,session_id,diagnostic_key) SELECT ${projection("diagnostic_events", "d")},g.occurrence_count,to_char(g.first_seen_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS first_seen_at,to_char(g.last_seen_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_seen_at FROM grouped g JOIN ${this.relation("diagnostic_events")} d ON d.id=g.latest_id ${cursorWhere} ORDER BY g.last_seen_at DESC,g.latest_id DESC LIMIT $${values.length}`;
    const rows = parseRows(
        diagnosticGroupSchema,
        (await this.query(sql, values)).rows,
      ),
      last = rows[q.limit - 1];
    return {
      items: rows.slice(0, q.limit),
      next_cursor:
        rows.length > q.limit
          ? encodeCursor("diagnostic_groups", q, last.last_seen_at, last.id)
          : null,
    };
  }
  async close() {
    await this.pool.end();
  }
}

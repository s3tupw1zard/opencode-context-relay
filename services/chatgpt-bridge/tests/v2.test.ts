import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tables,
  expectedType,
  PostgresStorage,
  type SqlPool,
} from "../src/storage/postgres.js";
import { encodeCursor, decodeCursor } from "../src/storage/cursor.js";
import { discoverPocketId } from "../src/auth/discovery.js";
import {
  decisionDetailSchema,
  diagnosticDetailSchema,
  checkSchema,
  gitStatsSchema,
} from "../src/domain/model.js";
const pool = (query: SqlPool["query"]): SqlPool => ({
  query,
  on: () => {},
  connect: async () => ({ query, release: () => {} }),
  end: async () => {},
});
test("v2 nested objects strip future/raw data and validate numeric aggregates", () => {
  for (const [schema, value] of [
    [decisionDetailSchema, { decision: "Keep", state: "active" }],
    [diagnosticDetailSchema, { summary: "Retry", severity: "minor" }],
    [checkSchema, { kind: "test", name: "unit", status: "passed" }],
    [gitStatsSchema, { changed_count: 2 }],
  ] as const)
    assert.equal("raw" in schema.parse({ ...value, raw: "private" }), false);
  assert.equal(
    gitStatsSchema.safeParse({ diff_insertions: -1 }).success,
    false,
  );
  assert.equal(
    checkSchema.safeParse({
      kind: "test",
      name: "unit",
      status: "passed",
      failed: -1,
    }).success,
    false,
  );
});
test("all nine v2 tables checked with explicit columns, missing table/column and wrong type fail closed", async () => {
  let calls = 0;
  const good = pool(async (sql) => {
    calls++;
    assert.match(sql, /LIMIT 0$/);
    assert.doesNotMatch(sql, /SELECT \*/);
    const t = /public\.(\w+)/.exec(sql)![1] as keyof typeof tables;
    return {
      rows: [],
      fields: (t === "diagnostic_events"
        ? [...Object.keys(tables[t].shape), "diagnostic_key"]
        : Object.keys(tables[t].shape)
      ).map((name) => ({
        name,
        dataTypeID: expectedType(name),
      })),
    };
  });
  assert.deepEqual(
    await new PostgresStorage("unused", 5000, 1000, good).checkSchema(),
    { storage: "reachable", schema: "compatible" },
  );
  assert.equal(calls, 9);
  for (const code of ["42P01", "42703"])
    assert.equal(
      (
        await new PostgresStorage(
          "unused",
          5000,
          1000,
          pool(async () => {
            throw { code, message: "secret" };
          }),
        ).checkSchema()
      ).schema,
      "incompatible",
    );
  assert.equal(
    (
      await new PostgresStorage(
        "unused",
        5000,
        1000,
        pool(async () => ({ rows: [], fields: [] })),
      ).checkSchema()
    ).schema,
    "incompatible",
  );
  assert.equal(
    (
      await new PostgresStorage(
        "unused",
        5000,
        1000,
        pool(async () => {
          throw { code: "ECONNREFUSED" };
        }),
      ).checkSchema()
    ).storage,
    "unavailable",
  );
});
test("cursors preserve microseconds and bind table/project/session/filter/time but allow limit changes", () => {
  const q = {
    project_id: "p",
    session_id: "s",
    limit: 1,
    since: "2026-10-01T00:00:00Z",
    category: "execution",
  };
  const cursor = encodeCursor(
    "activity_events",
    q,
    "2026-10-01T12:00:00.123456Z",
    "9007199254740993",
  );
  assert.equal(
    decodeCursor("activity_events", { ...q, limit: 2, cursor })!.t,
    "2026-10-01T12:00:00.123456Z",
  );
  for (const change of [
    { project_id: "q" },
    { session_id: "x" },
    { category: "read" },
    { since: "2026-09-01T00:00:00Z" },
  ])
    assert.throws(() =>
      decodeCursor("activity_events", { ...q, ...change, cursor }),
    );
  assert.throws(() => decodeCursor("validation_runs", { ...q, cursor }));
});
test("history query pushes filters and keyset into SQL with bounded limit and excludes raw payloads", async () => {
  const q = {
    project_id: "p",
    session_id: "s",
    limit: 3,
    category: "execution",
    event_type: "tool_completed",
    since: "2026-10-01T00:00:00Z",
    until: "2026-10-02T00:00:00Z",
  };
  const cursor = encodeCursor(
    "activity_events",
    q,
    "2026-10-01T12:00:00.123456Z",
    "12",
  );
  const db = new PostgresStorage(
    "unused",
    5000,
    1000,
    pool(async (sql, values) => {
      assert.match(sql, /project_id=\$1 AND session_id=\$2/);
      assert.match(sql, /\(created_at,id\)</);
      assert.match(sql, /ORDER BY created_at DESC,id DESC LIMIT/);
      assert.doesNotMatch(sql, /details|arguments|results|SELECT \*/);
      assert.deepEqual(values, [
        "p",
        "s",
        "execution",
        "tool_completed",
        q.since,
        q.until,
        "2026-10-01T12:00:00.123456Z",
        "12",
        4,
      ]);
      return { rows: [], fields: [] };
    }),
  );
  assert.deepEqual(await db.activity({ ...q, cursor }), {
    items: [],
    next_cursor: null,
  });
});
test("diagnostic grouping requires a bounded explicit window", async () => {
  const db = new PostgresStorage(
    "unused",
    5000,
    1000,
    pool(async () => ({ rows: [], fields: [] })),
  );
  await assert.rejects(
    db.diagnostics({ project_id: "p", limit: 2, group_by_problem: true }),
  );
  await assert.rejects(
    db.diagnostics({
      project_id: "p",
      limit: 2,
      group_by_problem: true,
      since: "2026-09-01T00:00:00Z",
      until: "2026-10-01T00:00:00Z",
    }),
  );
});
test("Pocket discovery uses advertised endpoints and rejects issuer/PKCE/JWKS drift", async () => {
  const m = {
    issuer: "https://id.example",
    jwks_uri: "https://id.example/.well-known/jwks.json",
    authorization_endpoint: "https://id.example/authorize",
    token_endpoint: "https://id.example/token",
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    client_id_metadata_document_supported: true,
  };
  const fetcher = (v: unknown) =>
    (async () => new Response(JSON.stringify(v))) as typeof fetch;
  assert.equal(
    (await discoverPocketId(m.issuer, undefined, fetcher(m))).jwks_uri,
    m.jwks_uri,
  );
  for (const bad of [
    { ...m, issuer: "https://wrong.example" },
    { ...m, code_challenge_methods_supported: ["plain"] },
    { ...m, jwks_uri: "http://unsafe.example" },
  ])
    await assert.rejects(discoverPocketId(m.issuer, undefined, fetcher(bad)));
  await assert.rejects(
    discoverPocketId(m.issuer, "https://wrong.example/jwks", fetcher(m)),
  );
});

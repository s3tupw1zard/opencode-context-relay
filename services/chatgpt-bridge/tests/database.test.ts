import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { PostgresStorage } from "../src/storage/postgres.js";
test(
  "disposable PostgreSQL: canonical schema, column grants, RLS and stable history pages",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const admin = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await admin.connect();
    try {
      await admin.query(await readFile("sql/publisher-schema-v2.sql", "utf8"));
      await admin.query(await readFile("sql/read-only-role.sql", "utf8"));
      await admin.query(
        "ALTER ROLE context_bridge_reader PASSWORD 'ci-only-password'",
      );
      await admin.query(
        "INSERT INTO public.session_metadata(project_id,session_id) VALUES ('p','s')",
      );
      await admin.query(
        "INSERT INTO public.activity_events(project_id,session_id,event_type,category,created_at) VALUES ('p','s','tool_completed','read','2026-10-01T12:00:00.123456Z'),('p','s','tool_completed','read','2026-10-01T12:00:00.123456Z'),('q','s','tool_completed','read','2026-10-01T12:00:00.123456Z')",
      );
      await admin.query(
        "INSERT INTO public.session_snapshots(project_id,session_id,branch,status,captured_at,rolling_summary) VALUES ('p','s','main','working','2026-10-01T12:00:00.123456Z','private'),('p','s','main','blocked','2026-10-01T12:00:00.123456Z','private')",
      );
      await admin.query(
        "INSERT INTO public.decision_log(project_id,session_id,decision_key,decision,state) VALUES ('p','s','a','Use PostgreSQL','active'),('p','s','b','Old approach','superseded')",
      );
      await admin.query(
        "INSERT INTO public.diagnostic_events(project_id,session_id,diagnostic_key,category,severity,summary,created_at) VALUES ('p','s','same','build','major','Earlier inserted latest time','2026-10-01T13:00:00Z'),('p','s','same','build','major','Later inserted older time','2026-10-01T12:00:00Z'),('p','s','other','test','minor','Other problem','2026-10-01T14:00:00Z')",
      );
      await admin.query(
        "INSERT INTO public.validation_runs(project_id,session_id,kind,name,status) VALUES ('p','s','test','unit','failed'),('p','s','build','bundle','passed')",
      );
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.username = "context_bridge_reader";
      url.password = "ci-only-password";
      const db = new PostgresStorage(url.toString());
      const reader = new pg.Client({ connectionString: url.toString() });
      await reader.connect();
      try {
        assert.deepEqual(await db.checkSchema(), {
          storage: "reachable",
          schema: "compatible",
        });
        assert.equal((await db.snapshot()).metadata!.length, 1);
        const q = { project_id: "p", session_id: "s", limit: 1 };
        const first = await db.activity(q);
        assert.ok(first.next_cursor);
        const next = await db.activity({ ...q, cursor: first.next_cursor });
        assert.equal(next.items.length, 1);
        assert.notEqual(first.items[0].id, next.items[0].id);
        assert.equal(next.next_cursor, null);
        assert.equal(first.items[0].created_at, "2026-10-01T12:00:00.123456Z");
        assert.equal(
          (await db.activity({ ...q, category: "execution" })).items.length,
          0,
        );
        assert.equal(
          (
            await db.activity({
              ...q,
              category: "read",
              event_type: "tool_completed",
            })
          ).items.length,
          1,
        );
        const h = await db.sessionHistory(q);
        assert.ok(h.next_cursor);
        const h2 = await db.sessionHistory({ ...q, cursor: h.next_cursor });
        assert.notEqual(h.items[0].id, h2.items[0].id);
        assert.equal(h2.next_cursor, null);
        assert.equal("rolling_summary" in h.items[0], false);
        assert.equal(
          (await db.decisions({ ...q, state: "superseded" })).items[0].decision,
          "Old approach",
        );
        assert.equal(
          (await db.validations({ ...q, kind: "test", status: "failed" }))
            .items[0].name,
          "unit",
        );
        assert.equal(
          (await db.validations({ ...q, kind: "test", status: "passed" })).items
            .length,
          0,
        );
        const d = await db.diagnostics({
          ...q,
          category: "build",
          severity: "major",
          group_by_problem: true,
          since: "2026-10-01T00:00:00Z",
          until: "2026-10-02T00:00:00Z",
        });
        assert.equal(d.items.length, 1);
        assert.equal(
          "occurrence_count" in d.items[0] && d.items[0].occurrence_count,
          2,
        );
        assert.equal(d.items[0].summary, "Earlier inserted latest time");
        assert.equal("diagnostic_key" in d.items[0], false);
        assert.equal(
          (await db.diagnostics({ ...q, severity: "minor", category: "test" }))
            .items[0].summary,
          "Other problem",
        );
        for (const sql of [
          "SELECT details FROM public.work_events",
          "SELECT * FROM public.browser_context",
          "DELETE FROM public.agent_state",
          "INSERT INTO public.session_metadata(project_id,session_id) VALUES ('x','x')",
        ])
          await assert.rejects(reader.query(sql));
        await admin.query(
          "ALTER TABLE public.agent_state RENAME COLUMN checks TO old_checks",
        );
        assert.equal((await db.checkSchema()).schema, "incompatible");
        await admin.query(
          "ALTER TABLE public.agent_state RENAME COLUMN old_checks TO checks",
        );
        await admin.query(
          "ALTER TABLE public.validation_runs RENAME TO old_validation_runs",
        );
        assert.equal((await db.checkSchema()).schema, "incompatible");
        await admin.query(
          "ALTER TABLE public.old_validation_runs RENAME TO validation_runs",
        );
      } finally {
        await reader.end();
        await db.close();
      }
    } finally {
      await admin.end();
    }
  },
);

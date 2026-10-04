import { test } from "node:test";
import assert from "node:assert/strict";
import type { Storage } from "../src/storage/types.js";
import { ContextService } from "../src/domain/service.js";
import {
  eventSchema,
  runtimeSchema,
  stateSchema,
  type Runtime,
  type State,
  type Event,
  type Selector,
} from "../src/domain/model.js";
import { sanitize } from "../src/domain/privacy.js";
import { authenticator } from "../src/auth/auth.js";
import { httpServer } from "../src/http.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const now = Date.parse("2026-10-01T18:00:00Z");
function runtime(
  project = "p",
  session = "a",
  status: Runtime["status"] = "working",
): Runtime {
  return {
    project_id: project,
    project_label: "Project",
    session_id: session,
    repository: "owner/repo",
    branch: "main",
    head_commit: "abc",
    git_dirty: false,
    changed_files: [],
    git_stats: {},
    status,
    current_action: "Testing",
    updated_at: new Date(now).toISOString(),
  };
}
function state(row = runtime()): State {
  return {
    ...row,
    goal: "Goal",
    current_task: "Task",
    reason: "Reason",
    approach_summary: "Approach",
    important_details: [],
    recent_progress: [],
    decisions: [],
    decision_details: [],
    diagnostics: [],
    checks: [],
    current_problem: null,
    problem_severity: null,
    next_step: "Next",
    rolling_summary: "Summary",
  };
}
class Memory implements Storage {
  constructor(
    public runtime: Runtime[] = [],
    public states: State[] = [],
    public history: Event[] = [],
  ) {}
  async snapshot() {
    return {
      runtime: runtimeSchema.array().parse(this.runtime),
      states: stateSchema.array().parse(this.states),
    };
  }
  async events(
    project: string,
    session: string | undefined,
    type: string | undefined,
    limit: number,
    before?: string,
  ) {
    return this.history
      .filter(
        (e) =>
          e.project_id === project &&
          (!session || e.session_id === session) &&
          (!type || e.event_type === type) &&
          (!before || BigInt(e.id) < BigInt(before)),
      )
      .slice(0, limit);
  }
  async checkSchema(): Promise<import("../src/storage/types.js").SchemaHealth> {
    return { storage: "reachable", schema: "compatible" };
  }
  async sessionHistory() {
    return { items: [], next_cursor: null };
  }
  async activity() {
    return { items: [], next_cursor: null };
  }
  async decisions() {
    return { items: [], next_cursor: null };
  }
  async diagnostics() {
    return { items: [], next_cursor: null };
  }
  async validations() {
    return { items: [], next_cursor: null };
  }
  async close() {}
}
function service(db = new Memory()) {
  return new ContextService(db, 900000, () => now);
}
async function result(
  db: Memory,
  name = "get_project_status",
  args: { project: Selector } = { project: { project_id: "p" } },
) {
  return (await service(db).call(name, args)) as Record<string, unknown>;
}
test("empty backend", async () =>
  assert.deepEqual(await service().call("list_projects", {}), {
    projects: [],
    next_cursor: null,
  }));
test("one project and context", async () => {
  const db = new Memory([runtime()], [state()]);
  assert.equal((await result(db)).project !== null, true);
  assert.equal(
    (await result(db, "get_current_context")).context !== null,
    true,
  );
});
test("multiple projects do not collide", async () => {
  const out = (await service(new Memory([runtime("p"), runtime("q")])).call(
    "list_projects",
    {},
  )) as { projects: unknown[] };
  assert.equal(out.projects.length, 2);
});
test("multiple sessions aggregate blocked > working > idle", async () => {
  const out = (await result(
    new Memory([
      runtime("p", "a", "idle"),
      runtime("p", "b", "working"),
      runtime("p", "c", "blocked"),
    ]),
  )) as { project: { aggregate_status: string; session_count: number } };
  assert.equal(out.project.aggregate_status, "blocked");
  assert.equal(out.project.session_count, 3);
});
for (const project of [
  { project_id: "p" },
  { project_label: "Project" },
  { repository: "owner/repo" },
])
  test(`selector ${JSON.stringify(project)}`, async () =>
    assert.ok(
      (
        (await service(new Memory([runtime()])).call("get_project_status", {
          project,
        })) as { project: unknown }
      ).project,
    ));
test("ambiguous label returns candidates", async () =>
  assert.equal(
    (
      await result(
        new Memory([runtime("p"), runtime("q")]),
        "get_project_status",
        { project: { project_label: "Project" } },
      )
    ).error,
    "ambiguous_project",
  ));
test("unknown project", async () =>
  assert.equal((await result(new Memory())).error, "project_not_found"));
test("stale blocked excluded from aggregate", async () => {
  const old = {
    ...runtime("p", "a", "blocked"),
    updated_at: "2025-01-01T00:00:00Z",
  };
  const out = (await result(new Memory([old, runtime("p", "b")]))) as {
    project: { aggregate_status: string; stale_session_count: number };
  };
  assert.equal(out.project.aggregate_status, "working");
  assert.equal(out.project.stale_session_count, 1);
});
test("newer state wins runtime and vice versa", async () => {
  const r = { ...runtime(), updated_at: "2026-10-01T17:59:00Z" };
  const out = (await result(
    new Memory([r], [state(runtime("p", "a", "blocked"))]),
  )) as { project: { aggregate_status: string } };
  assert.equal(out.project.aggregate_status, "blocked");
});
test("storage failure health contains no exception text", async () => {
  const db = new Memory();
  db.checkSchema = async () => ({
    storage: "unavailable",
    schema: "unverified",
  });
  assert.deepEqual(await service(db).call("health", {}), {
    server: "reachable",
    storage: "unavailable",
    schema: "unverified",
    version: "0.2.0",
    context_model: 2,
  });
});
test("invalid backend data rejected", () =>
  assert.equal(
    runtimeSchema.safeParse({ ...runtime(), status: "oops" }).success,
    false,
  ));
test("unknown columns stripped", () =>
  assert.equal(
    "password" in runtimeSchema.parse({ ...runtime(), password: "private" }),
    false,
  ));
test("credentials removed across output fields", () => {
  for (const secret of [
    "sb_secret_abc123",
    "eyJabcd.abcd.abcd",
    "postgres://user:pass@host/db",
    "password=abc",
    "-----BEGIN PRIVATE KEY-----",
    "```code```",
  ])
    assert.equal(
      sanitize({ goal: secret, branch: secret, repository: secret }) &&
        JSON.stringify(
          sanitize({ goal: secret, branch: secret, repository: secret }),
        ).includes(secret),
      false,
    );
  assert.deepEqual(
    sanitize({ changed_files: [".env", "../private.txt", "src/main.ts"] }),
    { changed_files: ["src/main.ts"] },
  );
  assert.equal(
    JSON.stringify(
      sanitize({ goal: "customcredential" }, ["customcredential"]),
    ).includes("customcredential"),
    false,
  );
});
test("list limit and cursor", async () => {
  const db = new Memory([runtime("a"), runtime("b"), runtime("c")]);
  assert.deepEqual(
    (
      (await service(db).call("list_projects", { limit: 1 })) as {
        next_cursor: string;
      }
    ).next_cursor,
    "a",
  );
  assert.equal(
    (
      (await service(db).call("list_projects", { limit: 1, cursor: "a" })) as {
        projects: { project_id: string }[];
      }
    ).projects[0].project_id,
    "b",
  );
});
test("event details never returned", async () => {
  const e = {
    id: "1",
    project_id: "p",
    project_label: null,
    session_id: "a",
    repository: null,
    branch: "main",
    head_commit: null,
    event_type: "checkpoint" as const,
    summary: "Safe",
    created_at: new Date(now).toISOString(),
  };
  const clean = eventSchema.parse({
    ...e,
    details: { password: "private" },
    unknown_column: "private",
  });
  const db = new Memory([runtime()], [], [clean]);
  const output = await service(db).call("get_recent_events", {
    project: { project_id: "p" },
  });
  assert.equal(JSON.stringify(output).includes("private"), false);
  assert.equal(JSON.stringify(output).includes("details"), false);
});
test("bearer requires valid auth", async () => {
  const auth = authenticator({
    mode: "bearer",
    audience: "x",
    token: "a".repeat(32),
  });
  assert.equal(await auth(undefined), false);
  assert.equal(await auth("Bearer wrong"), false);
  assert.equal(await auth("Bearer " + "a".repeat(32)), true);
});
test("real MCP HTTP initialization, tools/list, tool call and auth boundary", async () => {
  const app = httpServer({
    service: service(new Memory([runtime()], [state()])),
    publicUrl: "https://mcp.example.test/mcp",
    authenticate: authenticator({
      mode: "bearer",
      audience: "x",
      token: "a".repeat(32),
    }),
  });
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const address = app.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  // Proxy preserves the configured public host, including local test requests.
  const fetchProxy: typeof fetch = (url, init) =>
    fetch(url, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init?.headers).entries()),
        host: "mcp.example.test",
      },
    });
  try {
    assert.equal(
      (await fetchProxy(base + "/mcp", { method: "POST" })).status,
      401,
    );
    assert.equal(
      (
        await fetchProxy(base + "/health", {
          headers: { Authorization: "Bearer " + "a".repeat(32) },
        })
      ).status,
      200,
    );
    const client = new Client({ name: "test", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        fetch: fetchProxy,
        requestInit: { headers: { Authorization: "Bearer " + "a".repeat(32) } },
      }),
    );
    assert.equal((await client.listTools()).tools.length, 12);
    const out = await client.callTool({
      name: "list_projects",
      arguments: { limit: 1 },
    });
    assert.ok(out.structuredContent);
    assert.equal(out.isError, undefined);
    for (const name of [
      "get_project_status",
      "get_active_sessions",
      "get_current_context",
      "get_recent_events",
      "get_project_changes",
      "get_session_history",
      "get_activity_timeline",
      "get_decisions",
      "get_diagnostics",
      "get_validation_runs",
      "health",
    ]) {
      const response = await client.callTool({
        name,
        arguments:
          name === "health" || name === "get_active_sessions"
            ? {}
            : { project: { project_id: "p" } },
      });
      assert.equal(response.isError, undefined, JSON.stringify(response));
      assert.ok(response.structuredContent);
      assert.equal(
        "error" in
          (response.structuredContent as { result: Record<string, unknown> })
            .result,
        false,
      );
    }
    const invalid = await client.callTool({
      name: "list_projects",
      arguments: { limit: 51 },
    });
    assert.equal(invalid.isError, true);
    await client.close();
  } finally {
    await new Promise<void>((resolve) => app.close(() => resolve()));
  }
});
test("metadata-only closed sessions remain visible; closed blocked does not dominate fresh work; later activity reopens", async () => {
  const db = new Memory([runtime("p", "live")]);
  const m = {
    project_id: "p",
    project_label: "Project",
    session_id: "old",
    repository: "owner/repo",
    first_seen_at: "2026-09-01T00:00:00Z",
    last_seen_at: "2026-09-01T01:00:00Z",
    last_status: "blocked" as const,
    last_branch: "feature",
    last_head_commit: "def",
    last_git_dirty: false,
    closed_at: "2026-09-01T02:00:00Z",
  };
  db.snapshot = async () => ({
    runtime: db.runtime,
    states: [],
    metadata: [m],
  });
  const out = (await result(db)) as {
    project: {
      aggregate_status: string;
      session_count: number;
      closed_session_count: number;
    };
  };
  assert.equal(out.project.aggregate_status, "working");
  assert.equal(out.project.session_count, 2);
  assert.equal(out.project.closed_session_count, 1);
  const sessions = (await service(db).call("get_active_sessions", {})) as {
    sessions: { session_id: string; lifecycle: string }[];
  };
  assert.equal(
    sessions.sessions.find((s) => s.session_id === "old")!.lifecycle,
    "closed",
  );
  db.runtime.push(runtime("p", "old", "idle"));
  const reopened = (await service(db).call(
    "get_active_sessions",
    {},
  )) as typeof sessions;
  assert.equal(
    reopened.sessions.find((s) => s.session_id === "old")!.lifecycle,
    "idle",
  );
});

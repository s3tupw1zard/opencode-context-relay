import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { authenticator } from "../src/auth/auth.js";
import { httpServer } from "../src/http.js";
import { ContextService } from "../src/domain/service.js";
import { normalizeDates } from "../src/storage/postgres.js";
import { runtimeSchema } from "../src/domain/model.js";
import { config } from "../src/config.js";
test("Postgres timestamp values normalize to ISO-8601", () => {
  const date = new Date("2026-10-01T00:00:00Z");
  assert.deepEqual(normalizeDates([{ updated_at: date, other: "x" }]), [
    { updated_at: date.toISOString(), other: "x" },
  ]);
});
test("Postgres allowlist validates and strips unknown columns after normalization", () => {
  const row = {
    project_id: "p",
    project_label: null,
    session_id: "s",
    repository: null,
    branch: "main",
    head_commit: null,
    git_dirty: false,
    changed_files: [],
    git_stats: {},
    status: "idle",
    current_action: null,
    updated_at: new Date(),
    credentials: "private",
  };
  const normalized = normalizeDates([row]);
  assert.equal("credentials" in runtimeSchema.parse(normalized[0]), false);
});
test("production config rejects elevated database user and incomplete OAuth", () => {
  assert.throws(() =>
    config({
      DATABASE_URL: "postgresql://postgres:pw@local/db",
      MCP_PUBLIC_URL: "https://example.test/mcp",
      MCP_AUTH_MODE: "bearer",
      MCP_BEARER_TOKEN: "a".repeat(32),
    }),
  );
  assert.throws(() =>
    config({
      DATABASE_URL: "postgresql://reader:pw@local/db",
      MCP_PUBLIC_URL: "https://example.test/mcp",
    }),
  );
});
test("JWT verification enforces issuer audience expiry scope subject and signature", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "test",
    alg: "RS256",
    use: "sig",
  };
  const keys = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => keys.listen(0, "127.0.0.1", resolve));
  const address = keys.address();
  assert.ok(address && typeof address !== "string");
  const issuer = "https://auth.example.test",
    audience = "https://mcp.example.test/mcp";
  const auth = authenticator({
    mode: "oauth",
    issuer,
    audience,
    jwks: `http://127.0.0.1:${address.port}`,
    subject: "owner",
  });
  const sign = async (values: Record<string, unknown> = {}) =>
    new SignJWT({
      iss: issuer,
      aud: audience,
      sub: "owner",
      scope: "context.read",
      exp: Math.floor(Date.now() / 1000) + 300,
      ...values,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .sign(privateKey);
  try {
    assert.equal(await auth("Bearer " + (await sign())), true);
    assert.equal(
      await auth("Bearer " + (await sign({ scope: ["context.read"] }))),
      true,
    );
    for (const values of [
      { iss: "https://wrong" },
      { aud: "wrong" },
      { sub: "other" },
      { scope: "other" },
      { exp: 1 },
      { exp: undefined },
      { nbf: Math.floor(Date.now() / 1000) + 300 },
    ])
      assert.equal(await auth("Bearer " + (await sign(values))), false);
    const token = await sign();
    assert.equal(
      await auth("Bearer " + token.slice(0, -8) + "AAAAAAAA"),
      false,
    );
  } finally {
    await new Promise<void>((resolve) => keys.close(() => resolve()));
  }
});
test("OAuth discovery/challenge and anonymous requests never read storage", async () => {
  let reads = 0;
  const storage = {
    snapshot: async () => {
      reads++;
      return { states: [], runtime: [] };
    },
    events: async () => [],
    checkSchema: async () => ({
      storage: "reachable" as const,
      schema: "compatible" as const,
    }),
    sessionHistory: async () => ({ items: [], next_cursor: null }),
    activity: async () => ({ items: [], next_cursor: null }),
    decisions: async () => ({ items: [], next_cursor: null }),
    diagnostics: async () => ({ items: [], next_cursor: null }),
    validations: async () => ({ items: [], next_cursor: null }),
    close: async () => {},
  };
  const app = httpServer({
    service: new ContextService(storage),
    publicUrl: "https://mcp.example.test/mcp",
    issuer: "https://auth.example.test",
    authenticate: async () => false,
  });
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const address = app.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const discovery = await fetch(
      base + "/.well-known/oauth-protected-resource",
    );
    assert.equal(discovery.status, 200);
    assert.equal(
      (await discovery.json()).resource,
      "https://mcp.example.test/mcp",
    );
    const response = await fetch(base + "/mcp", { method: "POST" });
    assert.equal(response.status, 401);
    assert.ok(
      response.headers.get("www-authenticate")?.includes("resource_metadata"),
    );
    assert.equal(reads, 0);
    const origin = await fetch(base + "/mcp", {
      method: "POST",
      headers: { Origin: "https://evil.test" },
    });
    assert.equal(origin.status, 403);
  } finally {
    await new Promise<void>((resolve) => app.close(() => resolve()));
  }
});

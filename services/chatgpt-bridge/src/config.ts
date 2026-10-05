import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_SCHEMA: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).default("context_bridge"),
  MCP_HOST: z.string().default("127.0.0.1"),
  MCP_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  MCP_PUBLIC_URL: z.string().url(),
  MCP_AUTH_MODE: z.enum(["oauth", "bearer"]).default("oauth"),
  MCP_BEARER_TOKEN: z.string().min(32).optional(),
  OAUTH_ISSUER: z.string().url().optional(),
  OAUTH_JWKS_URL: z.string().url().optional(),
  OAUTH_ALLOWED_SUBJECT: z.string().min(1).optional(),
  OAUTH_ALLOW_SHARED_BACKEND: z.enum(["true", "false"]).default("false"),
  MCP_TRUST_PROXY_MTLS: z.enum(["true", "false"]).default("false"),
  MCP_EXPECTED_OPENAI_SAN: z.string().min(1).default("mtls.prod.connectors.openai.com"),
  STORAGE_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  STALE_AFTER_MS: z.coerce
    .number()
    .int()
    .min(60000)
    .max(86400000)
    .default(900000),
  STORAGE_MAX_ROWS: z.coerce.number().int().min(1).max(5000).default(1000),
});
export function config(env: NodeJS.ProcessEnv) {
  const c = schema.parse(env);
  const url = new URL(c.MCP_PUBLIC_URL);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/mcp"
  )
    throw new Error("MCP_PUBLIC_URL must be HTTPS with /mcp path");
  if (
    c.MCP_AUTH_MODE === "oauth" &&
    (!c.OAUTH_ISSUER ||
      (!c.OAUTH_ALLOWED_SUBJECT && c.OAUTH_ALLOW_SHARED_BACKEND !== "true"))
  )
    throw new Error("OAuth configuration incomplete");
  if (
    c.MCP_AUTH_MODE === "oauth" &&
    [c.OAUTH_ISSUER, c.OAUTH_JWKS_URL].some(
      (v) => v !== undefined && new URL(v).protocol !== "https:",
    )
  )
    throw new Error("OAuth requires HTTPS");
  if (c.MCP_AUTH_MODE === "bearer" && !c.MCP_BEARER_TOKEN)
    throw new Error("Bearer configuration incomplete");
  const db = new URL(c.DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    ["postgres", "supabase_admin", "service_role"].includes(
      decodeURIComponent(db.username),
    )
  )
    throw new Error("Use dedicated database read role");
  return c;
}

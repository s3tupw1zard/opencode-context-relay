import { discoverPocketId } from "./auth/discovery.js";
import { config } from "./config.js";
import { authenticator } from "./auth/auth.js";
import { PostgresStorage } from "./storage/postgres.js";
import { ContextService } from "./domain/service.js";
import { httpServer } from "./http.js";
try {
  const c = config(process.env);
  const discovery =
    c.MCP_AUTH_MODE === "oauth"
      ? await discoverPocketId(c.OAUTH_ISSUER!, c.OAUTH_JWKS_URL)
      : undefined;
  const storage = new PostgresStorage(
    c.DATABASE_URL,
    c.STORAGE_TIMEOUT_MS,
    c.STORAGE_MAX_ROWS,
    c.DATABASE_SCHEMA,
  );
  const service = new ContextService(storage, c.STALE_AFTER_MS);
  const db = new URL(c.DATABASE_URL);
  const server = httpServer({
    service,
    publicUrl: c.MCP_PUBLIC_URL,
    issuer: c.MCP_AUTH_MODE === "oauth" ? c.OAUTH_ISSUER : undefined,
    authenticate: authenticator({
      mode: c.MCP_AUTH_MODE,
      issuer: c.OAUTH_ISSUER,
      jwks: discovery?.jwks_uri,
      audience: c.MCP_PUBLIC_URL,
      subject: c.OAUTH_ALLOWED_SUBJECT,
      token: c.MCP_BEARER_TOKEN,
    }),
    trustProxyMtls: c.MCP_TRUST_PROXY_MTLS === "true",
    expectedOpenAiSan: c.MCP_EXPECTED_OPENAI_SAN,
    secrets: [
      c.DATABASE_URL,
      decodeURIComponent(db.password),
      c.MCP_BEARER_TOKEN ?? "",
    ],
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(c.MCP_PORT, c.MCP_HOST, () =>
    console.log("Context Bridge ready"),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      server.close(() => {
        void storage.close().then(() => process.exit(0));
      });
    });
} catch {
  console.error("Invalid configuration; check required settings");
  process.exit(1);
}

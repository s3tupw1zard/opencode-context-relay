import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ContextService } from "./domain/service.js";
import { createMcp } from "./mcp/server.js";
import { verifyOpenAiProxyMtls } from "./mtls.js";
export function httpServer(options: {
  service: ContextService;
  publicUrl: string;
  issuer?: string;
  authenticate: (header: string | undefined) => Promise<boolean>;
  secrets?: string[];
  trustProxyMtls?: boolean;
  expectedOpenAiSan?: string;
}) {
  const publicUrl = new URL(options.publicUrl);
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  const app = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const path = new URL(req.url ?? "/", "http://localhost").pathname;
        if (
          path === "/.well-known/oauth-protected-resource" ||
          path === "/.well-known/oauth-protected-resource/mcp"
        ) {
          if (req.method !== "GET") {
            json(res, 405, { error: "method_not_allowed" });
            return;
          }
          if (!options.issuer) {
            json(res, 404, { error: "not_found" });
            return;
          }
          json(res, 200, {
            resource: options.publicUrl,
            authorization_servers: [options.issuer],
            scopes_supported: ["context.read"],
            bearer_methods_supported: ["header"],
          });
          return;
        }
        if (path !== "/mcp" && path !== "/health") {
          json(res, 404, { error: "not_found" });
          return;
        }
        const address = app.address();
        const port =
          address && typeof address !== "string" ? address.port : 8787;
        const allowedHosts = new Set([
          publicUrl.host,
          `127.0.0.1:${port}`,
          `localhost:${port}`,
        ]);
        if (!req.headers.host || !allowedHosts.has(req.headers.host)) {
          json(res, 403, { error: "host_rejected" });
          return;
        }
        if (req.headers.origin && req.headers.origin !== publicUrl.origin) {
          json(res, 403, { error: "origin_rejected" });
          return;
        }
        const hasBearer = req.headers.authorization?.startsWith("Bearer ") ?? false;
        if (
          hasBearer &&
          options.trustProxyMtls &&
          !verifyOpenAiProxyMtls(
            req.headers,
            options.expectedOpenAiSan ?? "mtls.prod.connectors.openai.com",
          )
        ) {
          json(res, 403, { error: "mtls_required" });
          return;
        }
        if (!(await options.authenticate(req.headers.authorization))) {
          if (options.issuer)
            res.setHeader(
              "WWW-Authenticate",
              `Bearer resource_metadata="${publicUrl.origin}/.well-known/oauth-protected-resource", scope="context.read"`,
            );
          json(res, 401, { error: "unauthorized" });
          return;
        }
        if (path === "/health") {
          if (req.method !== "GET") {
            json(res, 405, { error: "method_not_allowed" });
            return;
          }
          json(res, 200, await options.service.call("health", {}));
          return;
        }
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          json(res, 405, { error: "method_not_allowed" });
          return;
        }
        if (!req.headers["content-type"]?.startsWith("application/json")) {
          json(res, 415, { error: "json_required" });
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += String(chunk);
          if (Buffer.byteLength(body) > 65536) {
            json(res, 413, { error: "request_too_large" });
            return;
          }
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          json(res, 400, { error: "invalid_json" });
          return;
        }
        const server = createMcp(
          options.service,
          options.secrets,
          Boolean(options.issuer),
        );
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, parsed);
      } catch {
        if (!res.headersSent) json(res, 500, { error: "internal_error" });
        else res.end();
      }
    },
  );
  return app;
}

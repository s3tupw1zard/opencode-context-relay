# Development and deployment

Node 24, npm. `npm ci`, copy .env.example to .env, fill settings, `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build`, `npm start`. Do not commit .env.
Alternative: `docker compose up -d --build` (same .env).
No OpenAI API key or paid API calls are needed by this service.

Default loopback listener 127.0.0.1:8787, authenticated GET /health and POST /mcp.
Docker listens 0.0.0.0 internally and maps loopback host port only.
Configure MCP_PUBLIC_URL to your final https://<domain>/mcp; no domain is preselected.

## Reverse proxy

Example for your existing Caddy (replace domain):

```
YOUR_MCP_DOMAIN {
    reverse_proxy 127.0.0.1:8787
}
```

Proxy /mcp, /health and /.well-known/oauth-protected-resource without path rewriting.
Preserve Host and Authorization headers. Do not put Studio Basic Auth in front of
this endpoint. TLS terminates at your proxy; private loopback backend is HTTP.
Caddy sends X-Forwarded-For/Proto/Host, but application deliberately derives OAuth
resource URLs from configured MCP_PUBLIC_URL, never untrusted forwarded headers.
If proxy runs in another container, route to service:8787 on the private network.

Transport is stateless Streamable HTTP, JSON responses enabled. POST carries
JSON-RPC; accept both application/json and text/event-stream in clients per MCP
SDK. This v1 uses no standalone legacy SSE endpoint, no persistent GET stream and
no MCP session IDs. GET/DELETE /mcp return 405. No websockets. Preserve request body
and protocol headers. Do not cache /mcp or /health. Prefer >=15-second upstream
timeout, request-size/rate limits and no authorization/body access logging.
No browser widget → no CORS needed. Origins, when present, must match public origin.

## OAuth and private ChatGPT connection

Configure your established authorization server to serve discovery metadata,
S256 PKCE, authorization-code flow, context.read scope and resource audience equal
to MCP_PUBLIC_URL. Use CIMD/DCR or a pre-registered client with the exact callback
shown by ChatGPT. Issuer discovery must describe compatible endpoints. This repo
implements resource-server verification and protected-resource discovery, not a
new identity provider. Never use another app's client ID or assume Pocket ID emits
the required resource audience without verifying it.

Set OAUTH_ISSUER and OAUTH_ALLOWED_SUBJECT; OAUTH_JWKS_URL is optional via discovery (your stable account sub).
Do not set the subject to an email guess. ChatGPT's server management flow shows
actual client metadata and callback. Complete login/consent in that flow.

After deploying, verify `/mcp` without credentials returns 401 with discovery header.
Use MCP Inspector to complete OAuth and check tools/list + all twelve tool calls.
Then in ChatGPT's private plugin/app developer connection flow add your HTTPS
/mcp URL, choose OAuth and complete linking. UI labels/availability vary by host;
this repo does not claim a plugin is connected until live verification succeeds.

`node scripts/package-plugin.mjs https://<domain>/mcp` creates a portable Agent
Plugins 1.0 archive containing manifest and verified endpoint.
Use ONLY after that actual endpoint is deployed and verified. Upload with Plugin
Creator to create a private plugin. Source packaging does not deploy/authenticate
it. The package intentionally contains no database credentials or access tokens.

Try “Welche Coding-Projekte sind aktiv?”, “Woran arbeitet PeliPocket?” and
“Welche Sessions sind blockiert?”. Follow pagination, clarify ambiguous projects
and communicate stale summaries. Exact code/diffs use the separate GitHub connector.
Voice tool support must be verified in the actual chosen ChatGPT voice surface;
this server alone cannot guarantee host-side voice tool availability.

## Pocket ID and NetBird

Use a separate MCP host, for example `context.s3tupw1zard.dev`, rather than Supabase's infrastructure host. If Caddy and MCP share a host, proxy to `127.0.0.1:8787`. If separate, proxy to the MCP host's private NetBird IP and bind MCP only to the private interface; firewall/NetBird policy must allow just the edge proxy to port 8787. Keep the public Host header. No path stripping, OAuth interception or response buffering is needed.

```caddyfile
context.s3tupw1zard.dev {
    reverse_proxy 127.0.0.1:8787
}
```

The public paths are `/mcp` and `/.well-known/oauth-protected-resource/mcp`; `/health` is protected. Pocket ID discovery/authorization/token endpoints must be reachable by the OAuth client; JWKS/discovery must be reachable by MCP. Do not expose PostgreSQL via Caddy. Diagnose 401 via issuer/audience/scope/subject; incompatible health via canonical migration/grants; unavailable health via internal routing/TLS/role permissions. Never paste tokens or raw database errors into chat/logs.

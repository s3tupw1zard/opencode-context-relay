# Security and privacy

Public data access is blocked without credentials. Recommended production mode is
OAuth 2.1 through an existing authorization server. JWT verification checks
JWKS signature (RS256/ES256), exact issuer, /mcp resource audience, expiry,
not-before if present, context.read scope and configured exact subject.
No database credentials are passed to ChatGPT or exposed in errors/logs.

The service publishes protected-resource metadata at
`/.well-known/oauth-protected-resource` and `/.../mcp`, and advertises it in 401
WWW-Authenticate. Tools declare OAuth securitySchemes at top level and mirrored
_meta for compatibility. The authorization server (not this service) must provide
OAuth metadata, authorization code + S256 PKCE, resource/audience binding, and
CIMD, DCR or a configured pre-registered ChatGPT client. An unrelated web login
reverse proxy is not a replacement for MCP OAuth.

Bearer mode is for private local Inspector/custom-client testing only: fixed

> =32-character random token, constant-time hash comparison. It is not represented
> as supported ChatGPT OAuth linking. Never expose an unauthenticated mode.

## Explicit data allowlist

Only identity/Git metadata/status/timestamps and the named semantic fields in
src/domain/model.ts are read. Unknown DB columns are stripped by Zod, SELECT uses
explicit columns, SQL grants are column-specific and output schemas are strict.
The event JSON details column and browser_context are never read. No SQL tools,
model-selected tables, generic HTTP proxy, raw code/diffs/prompts/logs, writes or
agent control exist. All DB queries use fixed SQL with bound values.

A second output filter checks every string (including identity and Git fields),
known configured secrets, key/JWT/Bearer/password/cookie/connection-string patterns,
code fences and obvious code/diff markers. Sensitive changed-file paths are dropped.
Values are inspected before truncation. Raw exception messages are discarded.
Publisher content is untrusted; the plugin's workflow instructs ChatGPT to treat
it as data and ignore embedded instructions.

These filters cannot prove that arbitrary natural language contains no source,
prompt or secret. The publisher must continue producing allowlisted semantic
summaries only. Pattern filtering is defense in depth, not a universal DLP guarantee.
Audit publishers and stored data before exposing the service.

SQL setup grants one backend's rows to the one allowed account only. Database-role
PUBLIC inheritance and existing SECURITY DEFINER functions must be audited for
side-effecting EXECUTE rights. See self-hosted.md. Private network access is preferred;
use verified TLS for remote PostgreSQL, never rejectUnauthorized=false.
No automatic production SQL, provisioning, schema migration or secret creation.

Request body max 64 KiB, bounded storage pool/timeouts, host/origin validation,
stateless transport and no storage exception logging. Add reverse-proxy rate limits
for the intended private usage. Do not log Authorization headers or request bodies.

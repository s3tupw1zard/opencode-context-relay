# Verification

The automated suite covers empty/single/multiple projects, concurrent sessions,
aggregation, all selector kinds, ambiguity, unknown projects, stale sessions,
newer runtime/state precedence, failed storage, invalid responses, unknown-column
stripping, privacy patterns and configured credentials, list pagination, missing
and invalid auth, health redaction, PostgreSQL Date normalization, OAuth discovery,
JWT issuer/audience/subject/scope/expiry/not-before/signature, and real MCP HTTP
initialization/tools/list/tool invocation/input limits.

Typecheck, ESLint, tests and build are required by CI. JWT tests serve local JWKS
using a generated keypair; no real identity provider credentials are used.
MCP tests use the actual official client/server SDK and HTTP transport.

Not verified here: live production Supabase/PostgreSQL connectivity/permissions,
container build (Docker unavailable), reverse proxy TLS, identity provider
PKCE/client registration/resource binding and ChatGPT linking. These require the
operator's actual endpoint, restricted database credentials and OAuth configuration.
No production database writes or migrations were executed.

Version 0.2.0 adds recursive nested v2 allowlist/number validation, metadata-only/closed/reopened lifecycle, all twelve real SDK tool calls, nine-table explicit schema/type checks, missing-table/column cases, microsecond cursor scope binding, history SQL filter pushdown, bounded diagnostics grouping and Pocket ID discovery validation. CI runs PostgreSQL 17 with the unmodified producer schema and reader SQL, verifies actual timestamp-tie pagination, denied writes/sensitive columns and missing v2-column health. That disposable test runs only with TEST_DATABASE_URL and is skipped locally when PostgreSQL is unavailable. Never point TEST_DATABASE_URL at production: the integration fixture performs schema/role/data writes.

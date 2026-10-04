# Existing self-hosted Supabase/PostgreSQL

Supabase infrastructure is https://supabase.s3tupw1zard.dev. This is NOT the MCP
endpoint. No Supabase project is created and no management API is called.

The preferred adapter connects to the existing PostgreSQL service on your private
network, using its actual host/port/database. You cannot derive a PostgreSQL
connection string from the HTTPS Supabase URL. Obtain it from your deployment.
PostgREST is intentionally not used, avoiding an elevated service_role key.

As your database administrator:

1. Check publisher schema plus multi-project migration are already present.
2. Review sql/read-only-role.sql. It assumes database `postgres`; adjust CONNECT
   if your database has another name. It is one-time SQL and fails if the role
   already exists, rather than silently altering an unknown role.
3. Confirm RLS is enabled on agent_state, agent_runtime and work_events.
4. Run the reviewed SQL manually, then use psql `\password context_bridge_reader`
   to set a strong password without putting it in source or SQL history.
5. Supply DATABASE_URL to the service, URL-encoding password characters.
6. Restrict network/pg_hba access to the service host; use sslmode=verify-full and
   trusted CA for remote transport. For same-host private Docker networking,
   local non-TLS is a deliberate deployment decision, never public DB exposure.

Rights: CONNECT, public schema USAGE, SELECT only on explicitly named columns of
nine tables, SELECT-only RLS policies, no BYPASSRLS/superuser/ownership/write grants.
No browser_context or work_events.details permission. No secret/service_role key.

Review inherited PUBLIC schema/function/database privileges on your actual database.
In particular writable SECURITY DEFINER functions with PUBLIC EXECUTE can weaken
an otherwise read-only login. Audit and revoke such PUBLIC rights after evaluating
existing application impact; NOINHERIT alone does not remove PUBLIC privileges.
Do not broadly revoke shared Supabase rights without reviewing dependent apps.

As the reader verify SELECT on the allowed columns works and SELECT details,
SELECT browser_context and INSERT/UPDATE/DELETE fail (test mutations inside a
transaction that you always roll back). No grants to anon/authenticated required.
A least-privilege integration test against your real backend is still a deployment
step because credentials/network access are not supplied here.

## v2 fresh setup and upgrades

For a **fresh** database, as admin (SQL is manual, never application startup):

```sh
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/publisher-schema-v2.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/read-only-role.sql
psql "$ADMIN_DATABASE_URL" -c '\password context_bridge_reader'
```

`ADMIN_DATABASE_URL` is an operator-only shell variable, never the MCP server's environment. Configure the publisher separately with its write credentials. For an existing v1 database first apply the canonical producer migration at the pinned commit documented in [Context Model v2](context-model-v2.md), then rerun the reader grants. Do not use the fresh schema as a substitute for that migration. The reader SQL is repeatable and gives explicit column SELECT and SELECT-only RLS on nine tables. It grants no browser_context access or work_events.details. Inspect existing memberships and inherited PUBLIC permissions/functions when reusing a role.

Configure `DATABASE_URL` using the internal PostgreSQL listener and dedicated reader password, URL encoded. This direct database address differs from Supabase's HTTPS URL. Prefer certificate-verified TLS; if a private NetBird network is used, restrict ACLs to MCP → PostgreSQL and edge proxy → MCP. PostgreSQL must not become publicly reachable. Ensure Docker/container routing can reach the private peer address.

See [Pocket ID setup](pocket-id.md) for concrete authorization settings. After setting the real public URL, build the installable plugin using the existing package script; deployment and actual ChatGPT account linking are operator steps.

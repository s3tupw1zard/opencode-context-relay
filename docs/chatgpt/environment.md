# Server environment

Values are configured server-side in `.env` or secret manager; never commit real credentials.

| Variable                   | Requirement/default                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| DATABASE_URL               | Required direct PostgreSQL connection using context_bridge_reader; private address, URL-encoded password, verified TLS where supported |
| MCP_PUBLIC_URL             | Required exact HTTPS URL with /mcp, no query/credentials; OAuth resource/audience                                                      |
| MCP_HOST                   | 127.0.0.1; use container/private interface if needed                                                                                   |
| MCP_PORT                   | 8787                                                                                                                                   |
| MCP_AUTH_MODE              | oauth; bearer only for private custom-client testing                                                                                   |
| OAUTH_ISSUER               | Required in OAuth mode; exact Pocket ID discovery issuer                                                                               |
| OAUTH_JWKS_URL             | Optional; if specified must equal discovery jwks_uri                                                                                   |
| OAUTH_ALLOWED_SUBJECT      | Owner's Pocket ID sub; required unless shared backend explicitly enabled                                                               |
| OAUTH_ALLOW_SHARED_BACKEND | false; true explicitly permits all resource-authorized users the same backend                                                          |
| MCP_BEARER_TOKEN           | At least 32 random characters, required only in bearer mode                                                                            |
| STORAGE_TIMEOUT_MS         | 5000, range 100–30000                                                                                                                  |
| STALE_AFTER_MS             | 900000, range 60000–86400000                                                                                                           |
| STORAGE_MAX_ROWS           | 1000 per current table, range 1–5000                                                                                                   |

TEST_DATABASE_URL is solely for disposable test PostgreSQL. ADMIN_DATABASE_URL in setup examples is an operator shell variable, never a server credential. No Supabase API/service-role key or Pocket ID client secret is stored by the resource server.

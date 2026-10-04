# OAuth setup for ChatGPT

OpenCode Context Relay uses OAuth 2.1 to authenticate the user and OpenAI-managed mTLS to authenticate ChatGPT as the MCP client.

This guide describes the values to enter when adding the relay as a custom MCP server in ChatGPT. It assumes that the public MCP endpoint and mTLS reverse proxy are already working.

See [OpenAI-managed mTLS](mtls.md) first if the public MCP edge is not configured yet.

## 1. Create an OAuth/OIDC client in your identity provider

Create a client for ChatGPT in your identity provider.

Use an authorization-code flow with PKCE and allow refresh tokens. The client should have access to:

```text
context.read
offline_access
```

The relay itself requires the access token to contain the `context.read` scope and an audience matching the configured `MCP_PUBLIC_URL`.

ChatGPT shows the callback URL while creating the MCP connection. Copy that exact callback URL into the identity provider's allowed redirect/callback URLs.

For a confidential client, copy the generated client ID and client secret; they are entered into ChatGPT later.

## 2. Create the custom MCP server in ChatGPT

In ChatGPT on the web:

1. Enable **Developer mode** in ChatGPT settings if it is not already enabled.
2. Open **Plugins** and select **Add (+)**.
3. Choose to create/connect a custom MCP server.
4. Fill in the basic connection fields:

| Field | Value |
| --- | --- |
| Name | Any descriptive name, for example `ChatGPT Context Bridge` |
| Description | Optional |
| Connection / Server URL | `https://<mcp_domain>/mcp` |
| Authentication | `OAuth` |

Open **Advanced OAuth settings** for the remaining values.

## 3. Scopes

Configure the ChatGPT scope fields as follows:

**Standard scopes**

```text
context.read
```

**Base scopes**

```text
offline_access
```

Keep `offline_access` enabled so ChatGPT can request refresh tokens and maintain the connection without requiring a new interactive login whenever the access token expires.

## 4. OAuth endpoints

Use the values for your identity provider below.

### Pocket ID

Set the relay environment variable:

```dotenv
OAUTH_ISSUER=https://<auth_domain>
```

Enter these values in ChatGPT:

| ChatGPT field | Value |
| --- | --- |
| Authorization URL | `https://<auth_domain>/authorize` |
| Token URL | `https://<auth_domain>/api/oidc/token` |
| Registration URL | Leave empty |
| OIDC configuration URL | `https://<auth_domain>/.well-known/openid-configuration` |
| OIDC UserInfo endpoint | `https://<auth_domain>/api/oidc/userinfo` |

Pocket ID does not need a registration URL for this custom-client setup.

### authentik

With authentik's normal per-application issuer mode, set:

```dotenv
OAUTH_ISSUER=https://<auth_domain>/application/o/<application_slug>/
```

Enter these values in ChatGPT:

| ChatGPT field | Value |
| --- | --- |
| Authorization URL | `https://<auth_domain>/application/o/authorize/` |
| Token URL | `https://<auth_domain>/application/o/token/` |
| Registration URL | Leave empty for now |
| OIDC configuration URL | `https://<auth_domain>/application/o/<application_slug>/.well-known/openid-configuration` |
| OIDC UserInfo endpoint | `https://<auth_domain>/application/o/userinfo/` |

The authentik paths above follow authentik's documented OAuth2/OIDC endpoints. Registration behavior has not yet been validated for this project, so this guide currently uses a manually created OAuth client and leaves the registration URL empty.

### Keycloak

Set the relay environment variable:

```dotenv
OAUTH_ISSUER=https://<auth_domain>/realms/<realm>
```

Enter these values in ChatGPT:

| ChatGPT field | Value |
| --- | --- |
| Authorization URL | `https://<auth_domain>/realms/<realm>/protocol/openid-connect/auth` |
| Token URL | `https://<auth_domain>/realms/<realm>/protocol/openid-connect/token` |
| Registration URL | Leave empty for now |
| OIDC configuration URL | `https://<auth_domain>/realms/<realm>/.well-known/openid-configuration` |
| OIDC UserInfo endpoint | `https://<auth_domain>/realms/<realm>/protocol/openid-connect/userinfo` |

The Keycloak paths above follow Keycloak's documented OIDC endpoints. Registration behavior has not yet been validated for this project, so this guide currently uses a manually created OAuth client and leaves the registration URL empty.

## 5. Resource and OIDC settings

The **Resource** field is normally filled automatically from the MCP server URL. Leave it at:

```text
https://<mcp_domain>/mcp
```

This must match `MCP_PUBLIC_URL`, because the relay verifies the token audience against that value.

Enable **OIDC** support.

For **Supported OIDC scopes**, enter **only**:

```text
context.read
offline_access
```

Do not add `openid`, `profile`, `email`, or other scopes to this ChatGPT field. For the currently tested Context Relay setup, advertising additional OIDC scopes here can make ChatGPT request scopes that the relay/provider combination is not configured to accept.

## 6. Custom OAuth client

Choose the **Custom OAuth client** registration method.

Use the values from the OAuth/OIDC client you created in the identity provider:

| ChatGPT field | Value |
| --- | --- |
| Callback URL | Generated by ChatGPT; copy this exact URL into the identity provider |
| OAuth Client ID | Client ID from the identity provider |
| OAuth Client Secret | Client secret from the identity provider |
| Token endpoint authentication method | `client_secret_basic` for the confidential-client setup described here |

The callback URL shown by ChatGPT is authoritative. Do not replace it with a manually constructed callback URL.

## 7. Finish the connection

After the fields are filled in:

1. Save/create the MCP connection.
2. Complete the OAuth login when ChatGPT opens the identity provider.
3. Allow ChatGPT to scan the MCP tools.
4. Verify that the connection is available in ChatGPT and can read Context Relay data.

If authorization succeeds but tool calls return `401` or `403`, check the access token for:

- issuer matching `OAUTH_ISSUER`;
- audience matching `MCP_PUBLIC_URL`;
- the `context.read` scope;
- a subject accepted by `OAUTH_ALLOWED_SUBJECT`, unless shared-backend mode is intentionally enabled.

## Provider references

- OpenAI OAuth authentication: <https://developers.openai.com/plugins/build/auth>
- Pocket ID OIDC client authentication: <https://pocket-id.org/docs/guides/oidc-client-authentication>
- authentik OAuth2/OIDC endpoints: <https://docs.goauthentik.io/add-secure-apps/providers/oauth2/>
- Keycloak OIDC endpoints: <https://www.keycloak.org/securing-apps/oidc-layers>

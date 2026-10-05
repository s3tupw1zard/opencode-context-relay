# Pocket ID OAuth setup

This page contains the Pocket ID-specific configuration required by OpenCode Context Relay in addition to the general [OAuth setup for ChatGPT](../oauth-setup.md).

Pocket ID needs to know about the MCP endpoint as an API resource before it can issue an access token with the correct audience and the `context.read` permission.

## 1. Create the Context Relay API

In Pocket ID, open:

```text
Settings -> APIs
```

Create a new API.

Use:

| Pocket ID field | Value |
| --- | --- |
| Name | Any descriptive name, for example `Context Bridge` |
| Resource | `https://<mcp_domain>/mcp` |

The Resource value should match the relay's `MCP_PUBLIC_URL` and the Resource shown in ChatGPT.

For example:

```dotenv
MCP_PUBLIC_URL=https://<mcp_domain>/mcp
```

Pocket ID uses this resource as the access token audience. The Context Relay bridge validates that audience, so the values need to refer to the same MCP resource.

Choose the Resource carefully because Pocket ID does not allow it to be changed after the API has been created.

## 2. Add the `context.read` permission

Open the API you just created and add a permission:

| Pocket ID field | Value |
| --- | --- |
| Permission key | `context.read` |
| Display name | For example `Read Context` |
| Description | Optional |

Only the permission key is security-sensitive for Context Relay. The bridge requires the access token to contain:

```text
context.read
```

If this permission is missing from the token, authenticated MCP requests are rejected.

## 3. Grant the ChatGPT OIDC client access

In the API's **Access** section, select **OIDC Clients** and add the OIDC client you created for ChatGPT.

Grant that client:

```text
User-delegated access
  context.read
```

For the normal ChatGPT integration, no **Client access (M2M)** permission is required.

The resulting configuration should effectively be:

```text
API resource
  https://<mcp_domain>/mcp

Permission
  context.read

OIDC client
  ChatGPT client
    User-delegated access: context.read
    Client access (M2M): none
```

This authorizes the ChatGPT client to request `context.read` on behalf of the signed-in user for the Context Relay API.

## 4. ChatGPT scopes

In ChatGPT, continue to use the scopes from the general OAuth guide:

**Standard scopes**

```text
context.read
```

**Base scopes**

```text
offline_access
```

**Supported OIDC scopes**

```text
context.read
offline_access
```

Do not create `offline_access` as a Context Relay API permission in Pocket ID. It is used for the OAuth refresh-token flow, while `context.read` is the API permission granted for the MCP resource.

## 5. Why this is required

ChatGPT sends the MCP resource in the OAuth request:

```text
resource=https://<mcp_domain>/mcp
```

and requests:

```text
context.read
```

Pocket ID uses the registered API resource and its client permission grant to issue an access token for that API.

The Context Relay bridge then verifies:

- the token signature;
- the configured Pocket ID issuer;
- the token audience against `MCP_PUBLIC_URL`;
- the authenticated subject;
- the presence of the `context.read` scope.

A valid Pocket ID login alone is therefore not sufficient. The API resource and permission grant are part of the authorization setup.

## Pocket ID reference

Pocket ID documents this feature under **APIs and Permissions**:

<https://pocket-id.org/docs/guides/apis>

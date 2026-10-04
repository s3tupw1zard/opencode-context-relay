# Deployment topologies

The project is designed around a simple default: OpenCode and the relay run on one machine. More distributed setups are supported without baking any particular homelab topology into the repository.

## 1. Single host — recommended default

```text
Internet
   |
   v
nginx :443
   |
   v
ChatGPT MCP :8787 (127.0.0.1 only)
   |
   v
PostgreSQL :5432 (127.0.0.1 only)
   ^
   |
OpenCode + opencode-context-relay
```

Run PostgreSQL, migrations and the ChatGPT bridge through `deploy/compose.yaml`. OpenCode runs normally on the host and connects to the writer role through `127.0.0.1:5432`.

Only nginx is publicly reachable.

## 2. Split database host over Tailscale

Example:

```text
Application host                         Database host
----------------                         -------------
OpenCode                                 PostgreSQL
opencode-context-relay  ---- Tailscale ---->
ChatGPT MCP bridge      ---- Tailscale ----->
nginx
```

Use the database host's Tailscale address or MagicDNS name in both PostgreSQL connection strings.

Recommended ACL intent:

```text
application host -> database host:5432
everything else  -> denied unless independently required
```

Tailscale protects the network path; it does not replace PostgreSQL authentication or the separate writer/reader roles.

PostgreSQL should listen only on the private interfaces needed for the deployment and `pg_hba.conf` should restrict the application host.

## 3. Separate edge reverse proxy

```text
Internet
   |
edge nginx
   |
   | Tailscale/private network
   v
application host
  |- ChatGPT bridge
  |- OpenCode relay
  '- PostgreSQL (or another private DB host)
```

Terminate the OpenAI-managed client certificate at the public edge. Forward the MCP request over the private network and ensure the application service accepts traffic only from that edge.

The edge must overwrite, not append, the trusted `X-OpenAI-MTLS-*` headers.

## 4. Secure MCP Tunnel

For private/developer deployments where no inbound MCP endpoint should be exposed, OpenAI Secure MCP Tunnel can forward MCP requests through an outbound-only tunnel client.

See <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels>.

A public plugin submission still requires the deployment model documented by OpenAI for public MCP endpoints.

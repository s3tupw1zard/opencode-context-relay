# OpenAI-managed mTLS

> **WIP:** this project is still under active development and has not received enough real-world testing for production-stable claims.

For a public MCP endpoint, mTLS identifies ChatGPT as the MCP client while OAuth 2.1 continues to identify and authorize the end user.

OpenAI's current requirements are:

1. a leaf client certificate must be present and chain to the published OpenAI Connectors mTLS CA;
2. the leaf must be valid for TLS client authentication;
3. its SAN `dnsName` must be `mtls.prod.connectors.openai.com`;
4. do not pin the rotating leaf certificate fingerprint.

Official reference: <https://developers.openai.com/plugins/build/auth>

## Download the OpenAI CA bundle

The repository includes a helper that downloads the currently published root and connector intermediate directly from OpenAI, validates that the intermediate chains to the root, and writes a bundle for nginx:

```sh
sudo sh ./scripts/update-openai-mtls-ca.sh
```

The underlying URLs are:

```text
https://developers.openai.com/plugins/mtls/openai-root-ca.pem
https://developers.openai.com/plugins/mtls/openai-connectors-mtls-ca.pem
```

By default the bundle is written to:

```text
/etc/nginx/mtls/openai-connectors-ca.pem
```

Review it, then:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Re-run the helper periodically or as part of your normal configuration-management process. The script intentionally does not reload nginx automatically.

## nginx split configuration

Copy or include `deploy/nginx/http-mtls-maps.conf` inside nginx's `http {}` block.

Then adapt `deploy/nginx/context-bridge.conf` as a site config. Replace:

- `context.example.com`;
- TLS certificate paths;
- the upstream address if the MCP service is on another host.

The default site config deliberately uses:

```nginx
ssl_verify_client optional;
```

Discovery and initial unauthenticated OAuth/MCP probes therefore remain possible. Once an `Authorization: Bearer ...` header is present, the `$reject_missing_mtls` map requires nginx to report `SUCCESS`.

nginx overwrites and forwards:

```text
X-OpenAI-MTLS-Verify
X-OpenAI-MTLS-Cert
```

The MCP service then checks the forwarded certificate SAN against `mtls.prod.connectors.openai.com`. Only enable `MCP_TRUST_PROXY_MTLS=true` when the service cannot be reached by untrusted clients except through that reverse proxy.

## PROXY protocol

Do **not** add `proxy_protocol` to the default nginx listener.

Use it only when an L4 proxy in front of nginx really sends PROXY protocol. A deployment of that kind might use:

```nginx
listen 443 ssl proxy_protocol;
listen [::]:443 ssl proxy_protocol;

set_real_ip_from 10.0.0.10;
real_ip_header proxy_protocol;
```

Restrict `set_real_ip_from` to the actual trusted proxy addresses.

## Secure MCP Tunnel

For private development deployments, OpenAI also provides Secure MCP Tunnel, which keeps the MCP server private and uses outbound HTTPS from a tunnel client. It is an alternative topology, not required for this project's public nginx+mTLS setup.

See: <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels>

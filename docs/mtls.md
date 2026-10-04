# OpenAI-managed mTLS

> **WIP:** this project is still under active development and has not received enough real-world testing for production-stable claims.

For a public MCP endpoint, mTLS identifies ChatGPT as the MCP client while OAuth 2.1 continues to identify and authorize the end user.

OpenAI currently requires the MCP TLS endpoint to:

1. receive a client certificate that chains to the published OpenAI Connectors mTLS CA;
2. verify that the leaf certificate is valid for TLS client authentication;
3. verify that the leaf certificate SAN `dnsName` is `mtls.prod.connectors.openai.com`;
4. avoid pinning the rotating leaf certificate fingerprint.

Official reference: <https://developers.openai.com/plugins/build/auth>

The setup below does **not** require cloning this repository.

## 1. Download the OpenAI CA certificates

Download the currently published OpenAI root and Connectors intermediate certificates directly from OpenAI:

```sh
curl -fsSLO https://developers.openai.com/plugins/mtls/openai-root-ca.pem
curl -fsSLO https://developers.openai.com/plugins/mtls/openai-connectors-mtls-ca.pem
```

Validate that both files are certificates and that the intermediate chains to the root:

```sh
openssl x509 -in openai-root-ca.pem -noout
openssl x509 -in openai-connectors-mtls-ca.pem -noout
openssl verify -CAfile openai-root-ca.pem openai-connectors-mtls-ca.pem
```

The final command should report:

```text
openai-connectors-mtls-ca.pem: OK
```

## 2. Create the nginx CA bundle

Create a dedicated nginx directory and merge the Connectors intermediate and OpenAI root into the bundle used by nginx:

```sh
sudo install -d -m 0755 /etc/nginx/mtls

cat openai-connectors-mtls-ca.pem openai-root-ca.pem \
  | sudo tee /etc/nginx/mtls/openai-connectors-ca.pem >/dev/null

sudo chmod 0644 /etc/nginx/mtls/openai-connectors-ca.pem
```

The resulting file is:

```text
/etc/nginx/mtls/openai-connectors-ca.pem
```

You can remove the two downloaded source files afterward if you do not need to keep them locally.

If you already have a clone of this repository, `scripts/update-openai-mtls-ca.sh` performs the same download, verification and bundle creation automatically. A local clone is not required for the normal setup.

## 3. Install the global nginx mTLS snippets

The repository contains the nginx `map` directives and debug log format used by the example site.

On Debian/Ubuntu, `/etc/nginx/conf.d/*.conf` is normally included from nginx's global `http {}` block, so the snippet can be downloaded directly there:

```sh
sudo install -d -m 0755 /etc/nginx/conf.d

RELEASE_REF=main

sudo curl -fsSL \
  "https://raw.githubusercontent.com/s3tupw1zard/opencode-context-relay/${RELEASE_REF}/deploy/nginx/http-mtls-maps.conf" \
  -o /etc/nginx/conf.d/context-relay-mtls.conf
```

For an exact development release, set `RELEASE_REF` to its Git tag instead, for example:

```sh
RELEASE_REF=v2026.1.0-dev.7
```

The snippet must be loaded inside nginx's `http {}` context. If your nginx package does not include `/etc/nginx/conf.d/*.conf` there, add the file from the appropriate `http {}` configuration instead.

The snippet allows initial unauthenticated discovery/OAuth requests without a client certificate. Once an `Authorization: Bearer ...` header is present, nginx requires `$ssl_client_verify` to be `SUCCESS`.

## 4. Download the nginx site boilerplate

The repository also contains a complete nginx site boilerplate for the Context Relay bridge.

For the normal Debian/Ubuntu `sites-available` / `sites-enabled` layout:

```sh
sudo install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled

RELEASE_REF=main

sudo curl -fsSL \
  "https://raw.githubusercontent.com/s3tupw1zard/opencode-context-relay/${RELEASE_REF}/deploy/nginx/context-bridge.conf" \
  -o /etc/nginx/sites-available/context-bridge.conf

sudo nano /etc/nginx/sites-available/context-bridge.conf
```

At minimum, change:

- `server_name context.example.com`;
- the `ssl_certificate` path;
- the `ssl_certificate_key` path;
- the upstream address if the ChatGPT bridge is not listening on `127.0.0.1:8787`.

The example assumes that your TLS certificate already exists, for example through Let's Encrypt.

Enable the site:

```sh
sudo ln -s \
  /etc/nginx/sites-available/context-bridge.conf \
  /etc/nginx/sites-enabled/context-bridge.conf
```

Then validate and reload nginx:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Do not reload nginx when `nginx -t` reports an error.

## 5. PROXY protocol is listener-wide

The included boilerplate assumes an **L4 proxy in front of nginx sends PROXY protocol** and therefore uses:

```nginx
listen 443 ssl proxy_protocol;
listen [::]:443 ssl proxy_protocol;

real_ip_header proxy_protocol;
```

This is important because the PROXY protocol expectation applies to the shared nginx listening socket. If several HTTPS sites share the same `:443` listener, configure them consistently.

For example, another nginx HTTPS site behind the same L4 proxy should also use:

```nginx
server {
    listen 443 ssl proxy_protocol;
    listen [::]:443 ssl proxy_protocol;

    server_name other.example.com;

    real_ip_header proxy_protocol;

    http2 on;

    # ...
}
```

If one site expects PROXY protocol while another site on the same address and port is configured as a normal TLS listener, unrelated HTTPS sites can stop working or nginx can reject the listener configuration.

When using nginx's real IP module, also trust only the actual L4 proxy addresses with `set_real_ip_from`. Do not trust arbitrary Internet sources.

### When nginx is directly exposed to the Internet

If nginx itself accepts public TCP/TLS connections and there is **no** L4 proxy sending PROXY protocol, remove it consistently from **all** affected `:443` server blocks:

```nginx
listen 443 ssl;
listen [::]:443 ssl;
```

and remove:

```nginx
real_ip_header proxy_protocol;
```

mTLS itself does not require PROXY protocol. PROXY protocol is only for preserving the original client connection information across an L4 proxy.

## 6. What the nginx mTLS configuration does

The site deliberately uses:

```nginx
ssl_client_certificate /etc/nginx/mtls/openai-connectors-ca.pem;
ssl_verify_client optional;
ssl_verify_depth 2;
```

`ssl_verify_client optional` requests and validates the OpenAI client certificate without making it mandatory for every initial discovery request.

Authenticated MCP requests are then protected by the global `$reject_missing_mtls` map:

```nginx
if ($reject_missing_mtls) {
    return 403;
}
```

nginx also overwrites and forwards:

```text
X-OpenAI-MTLS-Verify
X-OpenAI-MTLS-Cert
```

The ChatGPT bridge uses these trusted reverse-proxy headers to perform the additional SAN check for:

```text
mtls.prod.connectors.openai.com
```

Only enable:

```dotenv
MCP_TRUST_PROXY_MTLS=true
```

when untrusted clients cannot reach the bridge directly and bypass nginx.

With the default Docker Compose deployment, the bridge is bound to `127.0.0.1:8787`, which is the intended local-only topology.

## 7. Test the nginx setup

First verify that nginx can parse the complete configuration:

```sh
sudo nginx -t
```

You can inspect the effective configuration with:

```sh
sudo nginx -T
```

For the example configuration, mTLS requests are logged to:

```text
/var/log/nginx/context-mtls.log
```

The log includes nginx's client-certificate verification result and certificate subject/issuer information.

After configuration changes:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

## 8. Updating the OpenAI CA bundle

OpenAI may rotate certificates under its published CA chain. Do not pin the current leaf certificate.

To refresh the CA files without a repository clone, repeat the download and bundle steps above, verify them, then reload nginx only after a successful configuration test.

If you use the repository helper from a local checkout instead:

```sh
sudo sh ./scripts/update-openai-mtls-ca.sh
sudo nginx -t && sudo systemctl reload nginx
```

The helper intentionally does not reload nginx automatically.

## Secure MCP Tunnel

For private development deployments, OpenAI also provides Secure MCP Tunnel, which keeps the MCP server private and uses outbound HTTPS from a tunnel client. It is an alternative topology, not required for this project's public nginx + mTLS setup.

See: <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels>

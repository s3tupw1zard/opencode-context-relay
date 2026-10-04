import { X509Certificate } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Trust these headers only when the service is reachable exclusively through a
 * reverse proxy that overwrites them. nginx must already have validated the
 * client certificate chain against the published OpenAI connector CA bundle.
 */
export function verifyOpenAiProxyMtls(
  headers: IncomingHttpHeaders,
  expectedSan: string,
): boolean {
  if (first(headers["x-openai-mtls-verify"]) !== "SUCCESS") return false;
  const encoded = first(headers["x-openai-mtls-cert"]);
  if (!encoded) return false;

  try {
    const certificate = new X509Certificate(decodeURIComponent(encoded));
    return Boolean(
      certificate.checkHost(expectedSan, {
        subject: "never",
      }),
    );
  } catch {
    return false;
  }
}

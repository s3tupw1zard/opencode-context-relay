import { z } from "zod";
const https = z
  .string()
  .url()
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && !u.hash;
  });
const metadata = z.object({
  issuer: https,
  jwks_uri: https,
  authorization_endpoint: https,
  token_endpoint: https,
  code_challenge_methods_supported: z.array(z.string()),
  grant_types_supported: z.array(z.string()),
  client_id_metadata_document_supported: z.boolean().optional(),
  authorization_response_iss_parameter_supported: z.boolean().optional(),
});
export async function discoverPocketId(
  issuer: string,
  configuredJwks?: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(
    issuer.replace(/\/$/, "") + "/.well-known/openid-configuration",
    { signal: AbortSignal.timeout(5000), redirect: "error" },
  );
  if (!response.ok) throw new Error("OAuth discovery unavailable");
  const m = metadata.parse(await response.json());
  if (
    m.issuer !== issuer ||
    !m.code_challenge_methods_supported.includes("S256") ||
    !m.grant_types_supported.includes("authorization_code") ||
    !m.grant_types_supported.includes("refresh_token") ||
    (configuredJwks && configuredJwks !== m.jwks_uri)
  )
    throw new Error("OAuth discovery incompatible");
  return m;
}

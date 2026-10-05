import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHash, timingSafeEqual } from "node:crypto";
export type AuthConfig = {
  mode: "oauth" | "bearer";
  issuer?: string;
  jwks?: string;
  audience: string;
  subject?: string;
  token?: string;
};
export function authenticator(config: AuthConfig) {
  const jwks =
    config.mode === "oauth" ? createRemoteJWKSet(new URL(config.jwks!)) : null;
  return async (header: string | undefined) => {
    if (!header?.startsWith("Bearer ")) return false;
    const token = header.slice(7);
    if (token.length > 8192) return false;
    if (config.mode === "bearer")
      return timingSafeEqual(
        createHash("sha256").update(token).digest(),
        createHash("sha256").update(config.token!).digest(),
      );
    try {
      const { payload } = await jwtVerify(token, jwks!, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ["RS256", "ES256"],
        requiredClaims: ["exp", "sub"],
      });
      return (
        typeof payload.sub === "string" &&
        payload.sub.length > 0 &&
        (!config.subject || payload.sub === config.subject) &&
        (typeof payload.scope === "string"
          ? payload.scope.split(/\s+/)
          : Array.isArray(payload.scope) &&
              payload.scope.every((s) => typeof s === "string")
            ? payload.scope
            : []
        ).includes("context.read")
      );
    } catch {
      return false;
    }
  };
}

// Reject whole values before truncating; redact every output field, not only summaries.
export function safeText(
  value: string | null,
  max = 900,
  secrets: string[] = [],
): string | null {
  if (!value) return null;
  if (secrets.some((s) => s.length >= 8 && value.includes(s))) return null;
  if (
    /-----BEGIN|\b(?:sb_secret_|sb_publishable_|sk-|sk_|rk_|gh[pousr]_|github_pat_)[\w-]+|\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|(?:password|passwd|token|secret|api[_-]?key|cookie|authorization)\s*[:=]\s*\S+|\w+:\/\/[^\s/]*@|postgres(?:ql)?:\/\/|```|^diff --git|^@@|^\s*at \S+.*\([^)]*:\d+:\d+\)|\b(?:export|import)\s.+[;{}]/im.test(
      value,
    )
  )
    return null;
  return value.trim().replace(/\s+/g, " ").slice(0, max) || null;
}
export function safePath(value: string, secrets: string[]): string | null {
  if (
    /(^|\/)(?:\.env|secrets?|credentials?|private|id_rsa|id_ed25519)|(?:token|password|secret)|\.(?:pem|key|p12|pfx)$|(^|\/)\.\.(\/|$)|^[/\\]/i.test(
      value,
    )
  )
    return null;
  return safeText(value, 320, secrets);
}
export function sanitize(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === "string") return safeText(value, 1800, secrets);
  if (Array.isArray(value))
    return value.slice(0, 50).map((v) => sanitize(v, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        (k === "changed_files" || k === "paths") && Array.isArray(v)
          ? v
              .slice(0, 30)
              .map((p) => (typeof p === "string" ? safePath(p, secrets) : null))
              .filter(Boolean)
          : sanitize(v, secrets),
      ]),
    );
  return value;
}

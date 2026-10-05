const SENSITIVE_PATH_PATTERNS = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)(?:secrets?|credentials?|private)(?:\/|\.|-|_|$)/i,
  /(?:^|\/)(?:id_rsa|id_ed25519|authorized_keys|known_hosts)$/i,
  /\.(?:pem|p12|pfx|key)$/i,
  /(?:token|secret|password|credential)/i,
]

const SECRET_TEXT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:sk|rk|pk)_[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
  /\b(?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+/i,
]

export function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path))
}

export function safePath(path: unknown): string | undefined {
  if (typeof path !== "string") return undefined
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "").slice(0, 320)
  if (!normalized || normalized.startsWith("../") || isSensitivePath(normalized)) return undefined
  return normalized
}

export function safeSemanticText(value: unknown, max = 1200): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim().replace(/\s+/g, " ")
  if (!trimmed) return undefined
  if (SECRET_TEXT_PATTERNS.some((pattern) => pattern.test(trimmed))) return undefined
  return trimmed.slice(0, max)
}

export function safeSemanticList(value: unknown, maxItems = 12, maxItem = 500): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => safeSemanticText(item, maxItem))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems)
}

export function pathHintsFromToolInput(input: unknown): string[] {
  if (!input || typeof input !== "object") return []
  const object = input as Record<string, unknown>
  const keys = ["path", "file", "filePath", "filename", "target", "destination"]
  return keys
    .map((key) => safePath(object[key]))
    .filter((path): path is string => Boolean(path))
    .slice(0, 6)
}

import { appendFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import type { BridgeConfig } from "./config.js"

export type LogLevel = "error" | "warn" | "info" | "debug"

const priority: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

function redactString(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi, "$1[REDACTED]@")
    .replace(/(authorization\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/(token|password|secret|api[_-]?key)(\s*[:=]\s*)([^\s,;]+)/gi, "$1$2[REDACTED]")
    .slice(0, 1000)
}

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return redactString(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Error) {
    const withCode = value as Error & { code?: unknown }
    return {
      name: value.name,
      message: redactString(value.message),
      code: withCode.code === undefined ? undefined : String(withCode.code),
    }
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitize)
  if (typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/password|secret|token|authorization|database.?url|connection.?string|api.?key/i.test(key)) {
        result[key] = "[REDACTED]"
      } else {
        result[key] = sanitize(item)
      }
    }
    return result
  }
  return String(value)
}

export class BridgeLogger {
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly level: LogLevel,
    private readonly file: string,
  ) {}

  debug(message: string, fields: Record<string, unknown> = {}) {
    this.write("debug", message, fields)
  }

  info(message: string, fields: Record<string, unknown> = {}) {
    this.write("info", message, fields)
  }

  warn(message: string, fields: Record<string, unknown> = {}) {
    this.write("warn", message, fields)
  }

  error(message: string, fields: Record<string, unknown> = {}) {
    this.write("error", message, fields)
  }

  async flush(): Promise<void> {
    await this.queue
  }

  private write(level: LogLevel, message: string, fields: Record<string, unknown>) {
    if (priority[level] > priority[this.level]) return

    const safeFields = sanitize(fields) as Record<string, unknown>
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      component: "opencode-context-bridge",
      message: redactString(message),
      ...safeFields,
    })

    if (level === "error") console.error(`[opencode-context-bridge] ${message}`, safeFields)
    else if (level === "warn") console.warn(`[opencode-context-bridge] ${message}`, safeFields)
    else if (level === "debug") console.debug(`[opencode-context-bridge] ${message}`, safeFields)

    this.queue = this.queue
      .then(async () => {
        await mkdir(dirname(this.file), { recursive: true, mode: 0o700 })
        await appendFile(this.file, `${line}\n`, { encoding: "utf8", mode: 0o600 })
      })
      .catch((error) => {
        console.error("[opencode-context-bridge] failed to write plugin log", sanitize(error))
      })
  }
}

export function createLogger(config: BridgeConfig): BridgeLogger {
  return new BridgeLogger(config.logLevel, config.logFile)
}

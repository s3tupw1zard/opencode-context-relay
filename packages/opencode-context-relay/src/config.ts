import { existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

export type BridgeLogLevel = "error" | "warn" | "info" | "debug"

export interface BridgeConfig {
  databaseUrl?: string
  databaseSchema: string
  historyEnabled: boolean
  activityHistoryEnabled: boolean
  projectLabel?: string
  logLevel: BridgeLogLevel
  logFile: string
}

type RawConfig = Record<string, unknown>

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function optionalBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return undefined
  const normalized = value.toLowerCase().trim()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return undefined
}

function optionalLogLevel(value: unknown): BridgeLogLevel | undefined {
  const normalized = nonEmpty(value)?.toLowerCase()
  if (normalized && ["error", "warn", "info", "debug"].includes(normalized)) {
    return normalized as BridgeLogLevel
  }
  return undefined
}

function environmentValue(name: string): string | undefined {
  return nonEmpty(process.env[name])
}

export function globalConfigPath(): string {
  const explicit = environmentValue("BRIDGE_CONFIG_PATH")
  if (explicit) return isAbsolute(explicit) ? explicit : resolve(explicit)

  const configHome = environmentValue("XDG_CONFIG_HOME") ?? join(homedir(), ".config")
  return join(configHome, "opencode-context-bridge", "config.json")
}

export function defaultLogFile(): string {
  const stateHome = environmentValue("XDG_STATE_HOME") ?? join(homedir(), ".local", "state")
  return join(stateHome, "opencode-context-bridge", "opencode-context-bridge.log")
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".opencode", "context-bridge.json")
}

function readJson(path: string): RawConfig {
  if (!existsSync(path)) return {}
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Bridge config must contain a JSON object: ${path}`)
  }
  return parsed as RawConfig
}

function readGlobalConfig(): RawConfig {
  const path = globalConfigPath()
  if (!existsSync(path)) return {}

  try {
    if ((statSync(path).mode & 0o077) !== 0) {
      console.warn(
        `[opencode-context-bridge] ${path} contains global bridge configuration and should normally be chmod 600`,
      )
    }
  } catch {
    // Reading the config below will surface a useful error if the file is inaccessible.
  }

  return readJson(path)
}

function readProjectConfig(cwd: string): RawConfig {
  const path = projectConfigPath(cwd)
  const config = readJson(path)

  if ("databaseUrl" in config || "databaseSchema" in config || "logFile" in config) {
    console.warn(
      `[opencode-context-bridge] ignoring database/log-file settings in ${path}; keep them in the global config or environment`,
    )
  }

  return {
    historyEnabled: config.historyEnabled,
    activityHistoryEnabled: config.activityHistoryEnabled,
    projectLabel: config.projectLabel,
    logLevel: config.logLevel,
  }
}

export function hasUsableDatabaseUrl(config: Pick<BridgeConfig, "databaseUrl">): boolean {
  return Boolean(config.databaseUrl && !/REPLACE_ME/i.test(config.databaseUrl))
}

/**
 * Resolve configuration in descending priority:
 * plugin options > project config > global config > environment > defaults.
 *
 * Database connection settings intentionally skip project config so credentials
 * cannot accidentally be committed with a repository. The log file is also
 * global-only so repository config cannot redirect diagnostics into the project.
 */
export function loadConfig(
  options: Record<string, unknown> = {},
  cwd: string = process.cwd(),
): BridgeConfig {
  const project = readProjectConfig(cwd)
  const global = readGlobalConfig()

  return {
    databaseUrl:
      nonEmpty(options.databaseUrl) ??
      nonEmpty(global.databaseUrl) ??
      environmentValue("BRIDGE_DATABASE_URL"),
    databaseSchema:
      nonEmpty(options.databaseSchema) ??
      nonEmpty(global.databaseSchema) ??
      environmentValue("BRIDGE_DATABASE_SCHEMA") ??
      "context_bridge",
    historyEnabled:
      optionalBool(options.historyEnabled) ??
      optionalBool(project.historyEnabled) ??
      optionalBool(global.historyEnabled) ??
      optionalBool(process.env.BRIDGE_HISTORY_ENABLED) ??
      true,
    activityHistoryEnabled:
      optionalBool(options.activityHistoryEnabled) ??
      optionalBool(project.activityHistoryEnabled) ??
      optionalBool(global.activityHistoryEnabled) ??
      optionalBool(process.env.BRIDGE_ACTIVITY_HISTORY_ENABLED) ??
      true,
    projectLabel:
      nonEmpty(options.projectLabel) ??
      nonEmpty(project.projectLabel) ??
      nonEmpty(global.projectLabel) ??
      environmentValue("BRIDGE_PROJECT_LABEL"),
    logLevel:
      optionalLogLevel(options.logLevel) ??
      optionalLogLevel(project.logLevel) ??
      optionalLogLevel(global.logLevel) ??
      optionalLogLevel(process.env.BRIDGE_LOG_LEVEL) ??
      "info",
    logFile:
      nonEmpty(options.logFile) ??
      nonEmpty(global.logFile) ??
      environmentValue("BRIDGE_LOG_FILE") ??
      defaultLogFile(),
  }
}

export function configurationStatus(config: BridgeConfig, cwd: string) {
  const placeholder = Boolean(config.databaseUrl && /REPLACE_ME/i.test(config.databaseUrl))
  return {
    configured: hasUsableDatabaseUrl(config),
    databaseUrlAvailable: Boolean(config.databaseUrl),
    databaseUrlPlaceholder: placeholder,
    databaseSchema: config.databaseSchema,
    historyEnabled: config.historyEnabled,
    activityHistoryEnabled: config.activityHistoryEnabled,
    logLevel: config.logLevel,
    logFile: config.logFile,
    globalConfigPath: globalConfigPath(),
    globalConfigFound: existsSync(globalConfigPath()),
    projectConfigPath: projectConfigPath(cwd),
    projectConfigFound: existsSync(projectConfigPath(cwd)),
    pid: process.pid,
  }
}

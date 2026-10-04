import { basename } from "node:path"
import { Plugin } from "@opencode/plugin"
import { classifyToolActivity, safeToolName, type ActivityCategory } from "./activity.js"
import { configurationStatus, loadConfig, type BridgeConfig } from "./config.js"
import { createLogger } from "./logger.js"
import { buildSnapshot, sanitizeSemanticContext, type SemanticContextInput } from "./context.js"
import { readGitState, type GitState } from "./git.js"
import { pathHintsFromToolInput } from "./privacy.js"
import {
  checkPostgres,
  publishActivityEvent,
  publishRuntimeState,
  publishSnapshot,
  setPostgresLogger,
  type RuntimeStatus,
} from "./postgres.js"

const PLUGIN_ID = "opencode-context-relay"

type UnknownRecord = Record<string, unknown>

interface SessionScope {
  directory: string
  projectID: string
  config: BridgeConfig
  belongsToPluginProject: boolean
}

interface ToolExecution {
  sessionID: string
  tool: string
  category: ActivityCategory
  paths: string[]
  startedAt: number
}

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined
}

function eventPayloads(event: unknown): UnknownRecord[] {
  const root = record(event)
  if (!root) return []
  return [root, record(root.properties), record(root.data)].filter(
    (value): value is UnknownRecord => Boolean(value),
  )
}

function sessionIDOf(event: unknown): string | undefined {
  const type = eventTypeOf(event)
  for (const payload of eventPayloads(event)) {
    if (typeof payload.sessionID === "string") return payload.sessionID
    const info = record(payload.info)
    if (info && typeof info.id === "string") return info.id
    if (type?.startsWith("session.") && typeof payload.id === "string") return payload.id
  }
  return undefined
}

function callIDOf(event: unknown): string | undefined {
  for (const payload of eventPayloads(event)) {
    if (typeof payload.callID === "string") return payload.callID
    if (typeof payload.callId === "string") return payload.callId
  }
  return undefined
}

function toolNameOf(event: unknown): string | undefined {
  for (const payload of eventPayloads(event)) {
    if (typeof payload.tool === "string") return payload.tool
  }
  return undefined
}

function eventTypeOf(event: unknown): string | undefined {
  const root = record(event)
  return typeof root?.type === "string" ? root.type : undefined
}

function statusOf(event: unknown): string | undefined {
  for (const payload of eventPayloads(event)) {
    if (typeof payload.status === "string") return payload.status
    const status = record(payload.status)
    if (status && typeof status.type === "string") return status.type
  }
  return undefined
}

function isIdleEvent(event: unknown): boolean {
  const type = eventTypeOf(event)
  if (type === "session.idle") return true
  return type === "session.status" && statusOf(event) === "idle"
}

function sessionDirectory(session: unknown): string | undefined {
  const value = record(session)
  const location = record(value?.location)
  if (typeof location?.directory === "string") return location.directory
  if (typeof value?.directory === "string") return value.directory
  return undefined
}

function sessionProjectID(session: unknown): string | undefined {
  const value = record(session)
  return typeof value?.projectID === "string" ? value.projectID : undefined
}

function repositoryLabel(repository: string | undefined): string | undefined {
  if (!repository) return undefined
  const normalized = repository.replace(/\.git$/, "")
  const parts = normalized.split(/[/:]/).filter(Boolean)
  return parts.at(-1)
}

function projectLabel(config: BridgeConfig, git: GitState, directory: string): string {
  return config.projectLabel ?? repositoryLabel(git.repository) ?? basename(directory)
}

function executionKey(event: unknown, sessionID: string, tool: string): string {
  return callIDOf(event) ?? `${sessionID}:${tool}`
}

export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    const options = (ctx.options ?? {}) as Record<string, unknown>
    const startupConfig = loadConfig(options, ctx.location.directory)
    const logger = createLogger(startupConfig)
    setPostgresLogger(logger)

    logger.info("plugin initialized", {
      project_id: String(ctx.location.project.id),
      database_configured: startupConfig.databaseUrl ? !/REPLACE_ME/i.test(startupConfig.databaseUrl) : false,
      database_schema: startupConfig.databaseSchema,
      history_enabled: startupConfig.historyEnabled,
      activity_history_enabled: startupConfig.activityHistoryEnabled,
      log_level: startupConfig.logLevel,
      log_file: startupConfig.logFile,
    })

    if (startupConfig.databaseUrl && /REPLACE_ME/i.test(startupConfig.databaseUrl)) {
      logger.error("databaseUrl still contains the REPLACE_ME placeholder; publishing is disabled")
    } else if (!startupConfig.databaseUrl) {
      logger.warn("PostgreSQL is not configured; set databaseUrl or BRIDGE_DATABASE_URL")
    } else {
      void checkPostgres(startupConfig).then((health) => {
        if (health.storage === "unavailable") {
          logger.error("PostgreSQL is unavailable during startup check")
        } else if (health.storage === "reachable" && health.schema === "missing") {
          logger.warn("PostgreSQL is reachable but the context schema is missing", {
            schema: startupConfig.databaseSchema,
          })
        } else if (health.storage === "reachable") {
          logger.info("PostgreSQL startup check succeeded", {
            schema: startupConfig.databaseSchema,
          })
        }
      })
    }

    const scopeForSession = async (sessionID: string): Promise<SessionScope> => {
      let directory: string = ctx.location.directory
      let projectID: string = ctx.location.project.id

      try {
        const session = await ctx.session.get({ sessionID })
        directory = sessionDirectory(session) ?? directory
        projectID = sessionProjectID(session) ?? projectID
      } catch (error) {
        logger.debug("session lookup failed; using plugin location fallback", {
          session_id: sessionID,
          error,
        })
      }

      return {
        directory,
        projectID,
        config: loadConfig(options, directory),
        belongsToPluginProject: projectID === String(ctx.location.project.id),
      }
    }

    const lastRuntimePublish = new Map<string, number>()
    const currentAction = new Map<string, string>()
    const knownProjectLabels = new Map<string, string>()
    const toolExecutions = new Map<string, ToolExecution>()

    const labelForScope = (scope: SessionScope) =>
      knownProjectLabels.get(scope.projectID) ?? scope.config.projectLabel ?? basename(scope.directory)

    const runtimePublish = async (
      sessionID: string,
      status: RuntimeStatus,
      action?: string,
    ) => {
      const scope = await scopeForSession(sessionID)
      const git = await readGitState(scope.directory)
      const label = projectLabel(scope.config, git, scope.directory)
      knownProjectLabels.set(scope.projectID, label)
      await publishRuntimeState(scope.config, {
        project_id: scope.projectID,
        project_label: label,
        session_id: sessionID,
        repository: git.repository,
        branch: git.branch,
        head_commit: git.headCommit,
        git_dirty: git.dirty,
        changed_files: git.changedFiles,
        git_stats: git.stats,
        status,
        current_action: action ?? currentAction.get(sessionID),
        updated_at: new Date().toISOString(),
      })
    }

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "bridge",
        description: "Publish only structured, non-sensitive semantic work context for ChatGPT.",
      })
      editor.add({
        name: "publish_context",
        description:
          "Publish structured semantic OpenCode context. Include decisions, diagnostics and validation/check results when useful. Never include source code, diffs, raw terminal output, prompts, credentials or secrets.",
        options: { namespace: "bridge" },
        input: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["working", "idle", "blocked"] },
            goal: { type: "string" },
            current_task: { type: "string" },
            reason: { type: "string" },
            approach_summary: { type: "string" },
            important_details: { type: "array", items: { type: "string" } },
            recent_progress: { type: "array", items: { type: "string" } },
            decisions: { type: "array", items: { type: "string" } },
            decision_details: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  decision: { type: "string" },
                  rationale: { type: "string" },
                  state: { type: "string", enum: ["active", "superseded"] },
                },
                required: ["decision"],
              },
            },
            diagnostics: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  summary: { type: "string" },
                  severity: { type: "string", enum: ["info", "minor", "major", "blocked"] },
                  category: { type: "string" },
                  source: { type: "string" },
                  retry_count: { type: "integer", minimum: 0 },
                },
                required: ["summary", "severity"],
              },
            },
            checks: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  kind: { type: "string", enum: ["test", "build", "lint", "typecheck", "validation"] },
                  name: { type: "string" },
                  status: { type: "string", enum: ["passed", "failed", "partial", "skipped"] },
                  summary: { type: "string" },
                  passed: { type: "integer", minimum: 0 },
                  failed: { type: "integer", minimum: 0 },
                  skipped: { type: "integer", minimum: 0 },
                  duration_ms: { type: "integer", minimum: 0 },
                },
                required: ["kind", "name", "status"],
              },
            },
            current_problem: { type: "string" },
            problem_severity: { type: "string", enum: ["info", "minor", "major", "blocked"] },
            next_step: { type: "string" },
            rolling_summary: { type: "string" },
          },
          required: ["status", "current_task", "approach_summary", "recent_progress", "next_step"],
        },
        execute: async (input, toolContext) => {
          const scope = await scopeForSession(toolContext.sessionID)
          const semantic = sanitizeSemanticContext(input as SemanticContextInput)
          const git = await readGitState(scope.directory)
          const label = projectLabel(scope.config, git, scope.directory)
          knownProjectLabels.set(scope.projectID, label)
          const snapshot = buildSnapshot(
            scope.projectID,
            label,
            toolContext.sessionID,
            git,
            semantic,
          )
          let published = false
          try {
            published = await publishSnapshot(scope.config, snapshot)
          } catch (error) {
            logger.error("context snapshot publish failed", {
              project_id: scope.projectID,
              session_id: toolContext.sessionID,
              error,
            })
            return {
              content: `Context snapshot publish failed; see ${scope.config.logFile} for diagnostics.`,
            }
          }

          if (published) {
            const action = semantic.current_task ??
              (semantic.status === "idle" ? "OpenCode is idle" : "Context published")
            currentAction.set(toolContext.sessionID, action)
            await publishRuntimeState(scope.config, {
              project_id: scope.projectID,
              project_label: label,
              session_id: toolContext.sessionID,
              repository: git.repository,
              branch: git.branch,
              head_commit: git.headCommit,
              git_dirty: git.dirty,
              changed_files: git.changedFiles,
              git_stats: git.stats,
              status: semantic.status,
              current_action: action,
              updated_at: new Date().toISOString(),
            }).catch((error) => {
              logger.warn("runtime state publish failed after context snapshot publish", {
                project_id: scope.projectID,
                session_id: toolContext.sessionID,
                error,
              })
            })
            logger.debug("context snapshot published", {
              project_id: scope.projectID,
              session_id: toolContext.sessionID,
            })
            return { content: "Context snapshot published." }
          }

          const status = configurationStatus(scope.config, scope.directory)
          return {
            content:
              `Context snapshot validated but PostgreSQL is not configured; nothing was sent. ` +
              `DATABASE_URL=${status.databaseUrlAvailable ? "set" : "missing"}, ` +
              `schema=${status.databaseSchema}, ` +
              `globalConfig=${status.globalConfigFound ? status.globalConfigPath : `missing (${status.globalConfigPath})`}, ` +
              `projectConfig=${status.projectConfigFound ? status.projectConfigPath : "not present"}, ` +
              `pid=${status.pid}.`,
          }
        },
      })
    })


    await ctx.tool.hook("execute.before", async (event) => {
      const sessionID = sessionIDOf(event)
      if (!sessionID) return

      const object = record(event) ?? {}
      const tool = safeToolName(toolNameOf(event))
      const paths = pathHintsFromToolInput(object.input)
      const category = classifyToolActivity(tool)
      const key = executionKey(event, sessionID, tool)
      toolExecutions.set(key, {
        sessionID,
        tool,
        category,
        paths,
        startedAt: Date.now(),
      })

      currentAction.set(
        sessionID,
        paths.length > 0 ? `${tool}: ${paths.join(", ")}` : `${tool} in progress`,
      )

      const now = Date.now()
      if (now - (lastRuntimePublish.get(sessionID) ?? 0) < 10_000) return
      lastRuntimePublish.set(sessionID, now)
      await runtimePublish(sessionID, "working").catch((error) => logger.warn("background bridge publish failed", { error }))
    })

    await ctx.tool.hook("execute.after", async (event) => {
      const sessionID = sessionIDOf(event)
      if (!sessionID) return
      const scope = await scopeForSession(sessionID)
      if (!scope.belongsToPluginProject) return

      const tool = safeToolName(toolNameOf(event))
      const key = executionKey(event, sessionID, tool)
      const tracked = toolExecutions.get(key)
      toolExecutions.delete(key)
      const failed = statusOf(event) === "error"
      const duration = tracked ? Math.min(Math.max(Date.now() - tracked.startedAt, 0), 24 * 60 * 60 * 1000) : undefined

      currentAction.set(sessionID, failed ? `${tool} failed` : `${tool} completed`)
      await publishActivityEvent(scope.config, {
        project_id: scope.projectID,
        project_label: labelForScope(scope),
        session_id: sessionID,
        event_type: failed ? "tool_failed" : "tool_completed",
        category: tracked?.category ?? classifyToolActivity(tool),
        tool_name: tool,
        paths: tracked?.paths ?? [],
        outcome: failed ? "error" : "success",
        duration_ms: duration,
        created_at: new Date().toISOString(),
      }).catch((error) => logger.warn("background bridge publish failed", { error }))
    })

    const controller = new AbortController()
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          const type = eventTypeOf(event)
          const sessionID = sessionIDOf(event)
          if (!sessionID) continue

          const scope = await scopeForSession(sessionID)
          if (!scope.belongsToPluginProject) continue

          if (type === "session.error") {
            currentAction.set(sessionID, "OpenCode session error")
            await runtimePublish(sessionID, "blocked", "OpenCode session error").catch((error) => logger.warn("background bridge publish failed", { error }))
            await publishActivityEvent(scope.config, {
              project_id: scope.projectID,
              project_label: labelForScope(scope),
              session_id: sessionID,
              event_type: "session_error",
              category: "session",
              outcome: "error",
              created_at: new Date().toISOString(),
            }).catch((error) => logger.warn("background bridge publish failed", { error }))
            continue
          }

          if (type === "session.compacted") {
            await publishActivityEvent(scope.config, {
              project_id: scope.projectID,
              project_label: labelForScope(scope),
              session_id: sessionID,
              event_type: "session_compacted",
              category: "session",
              outcome: "success",
              created_at: new Date().toISOString(),
            }).catch((error) => logger.warn("background bridge publish failed", { error }))
            continue
          }

          if (!isIdleEvent(event)) continue

          currentAction.set(sessionID, "OpenCode is idle")
          await runtimePublish(sessionID, "idle", "OpenCode is idle").catch((error) => logger.warn("background bridge publish failed", { error }))
          await publishActivityEvent(scope.config, {
            project_id: scope.projectID,
            project_label: labelForScope(scope),
            session_id: sessionID,
            event_type: "session_idle",
            category: "session",
            outcome: "idle",
            created_at: new Date().toISOString(),
          }).catch((error) => logger.warn("background bridge publish failed", { error }))

        }
      } catch (error) {
        if (!controller.signal.aborted) logger.error("event loop failed", { error })
      }
    })()

    return () => {
      logger.info("plugin stopping")
      controller.abort()
    }
  },
})

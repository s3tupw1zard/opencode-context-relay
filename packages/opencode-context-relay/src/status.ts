export const RELAY_DATABASE_STATUSES = [
  "checking",
  "connected",
  "unconfigured",
  "unavailable",
  "schema_missing",
  "publish_failed",
] as const

export type RelayDatabaseStatus = (typeof RELAY_DATABASE_STATUSES)[number]

export interface RelayStatusSnapshot {
  status: RelayDatabaseStatus
  changed_at: string
}

export type RelayNoticeVariant = "info" | "success" | "warning" | "error"

export interface RelayStatusNotice {
  title: string
  message: string
  variant: RelayNoticeVariant
  duration: number
}

export function createRelayStatus(
  status: RelayDatabaseStatus,
  now: Date = new Date(),
): RelayStatusSnapshot {
  return {
    status,
    changed_at: now.toISOString(),
  }
}

export function isRelayStatusSnapshot(value: unknown): value is RelayStatusSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.changed_at === "string" &&
    typeof record.status === "string" &&
    RELAY_DATABASE_STATUSES.includes(record.status as RelayDatabaseStatus)
  )
}

function failureNotice(status: RelayDatabaseStatus): RelayStatusNotice | undefined {
  switch (status) {
    case "unconfigured":
      return {
        title: "Context Relay",
        message: "PostgreSQL is not configured. Context publishing is disabled.",
        variant: "warning",
        duration: 8000,
      }
    case "unavailable":
      return {
        title: "Context Relay",
        message:
          "PostgreSQL connection failed. Context publishing is disabled. Check the global Context Relay database configuration.",
        variant: "error",
        duration: 8000,
      }
    case "schema_missing":
      return {
        title: "Context Relay",
        message:
          "PostgreSQL is reachable, but the Context Relay schema is missing. Run the Context Relay migrations.",
        variant: "error",
        duration: 8000,
      }
    case "publish_failed":
      return {
        title: "Context Relay",
        message:
          "PostgreSQL is reachable, but Context Relay could not publish data. Check the Context Relay log for details.",
        variant: "error",
        duration: 8000,
      }
    default:
      return undefined
  }
}

export function noticeForRelayStatus(
  previous: RelayDatabaseStatus | undefined,
  next: RelayDatabaseStatus,
  initial = false,
): RelayStatusNotice | undefined {
  if (previous === next) return undefined

  if (next === "connected") {
    if (initial || previous === undefined || previous === "checking") return undefined
    return {
      title: "Context Relay",
      message: "PostgreSQL connection restored. Context publishing is active.",
      variant: "success",
      duration: 5000,
    }
  }

  if (next === "checking") return undefined
  return failureNotice(next)
}

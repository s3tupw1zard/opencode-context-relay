import { safeSemanticList, safeSemanticText } from "./privacy.js"
import type { GitState } from "./git.js"

export type ContextStatus = "working" | "idle" | "blocked"
export type ProblemSeverity = "info" | "minor" | "major" | "blocked"
export type DecisionState = "active" | "superseded"
export type CheckKind = "test" | "build" | "lint" | "typecheck" | "validation"
export type CheckStatus = "passed" | "failed" | "partial" | "skipped"

export interface DecisionDetail {
  decision: string
  rationale?: string
  state: DecisionState
}

export interface DiagnosticDetail {
  summary: string
  severity: ProblemSeverity
  category?: string
  source?: string
  retry_count?: number
}

export interface ValidationCheck {
  kind: CheckKind
  name: string
  status: CheckStatus
  summary?: string
  passed?: number
  failed?: number
  skipped?: number
  duration_ms?: number
}

export interface SemanticContextInput {
  status?: unknown
  goal?: unknown
  current_task?: unknown
  reason?: unknown
  approach_summary?: unknown
  important_details?: unknown
  recent_progress?: unknown
  decisions?: unknown
  decision_details?: unknown
  diagnostics?: unknown
  checks?: unknown
  current_problem?: unknown
  problem_severity?: unknown
  next_step?: unknown
  rolling_summary?: unknown
}

export interface SemanticContext {
  status: ContextStatus
  goal?: string
  current_task?: string
  reason?: string
  approach_summary?: string
  important_details: string[]
  recent_progress: string[]
  decisions: string[]
  decision_details: DecisionDetail[]
  diagnostics: DiagnosticDetail[]
  checks: ValidationCheck[]
  current_problem?: string
  problem_severity?: ProblemSeverity
  next_step?: string
  rolling_summary?: string
}

const statuses = new Set<ContextStatus>(["working", "idle", "blocked"])
const severities = new Set<ProblemSeverity>(["info", "minor", "major", "blocked"])
const decisionStates = new Set<DecisionState>(["active", "superseded"])
const checkKinds = new Set<CheckKind>(["test", "build", "lint", "typecheck", "validation"])
const checkStatuses = new Set<CheckStatus>(["passed", "failed", "partial", "skipped"])

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function nonNegativeInteger(value: unknown, max = 1_000_000): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.min(Math.max(Math.trunc(value), 0), max)
}

function sanitizeDecisionDetails(value: unknown): DecisionDetail[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const input = record(item)
    if (!input) return []
    const decision = safeSemanticText(input.decision, 700)
    if (!decision) return []
    const state = typeof input.state === "string" && decisionStates.has(input.state as DecisionState)
      ? (input.state as DecisionState)
      : "active"
    return [{
      decision,
      rationale: safeSemanticText(input.rationale, 1200),
      state,
    }]
  }).slice(0, 12)
}

function sanitizeDiagnostics(value: unknown): DiagnosticDetail[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const input = record(item)
    if (!input) return []
    const summary = safeSemanticText(input.summary, 1200)
    if (!summary) return []
    const severity = typeof input.severity === "string" && severities.has(input.severity as ProblemSeverity)
      ? (input.severity as ProblemSeverity)
      : "info"
    return [{
      summary,
      severity,
      category: safeSemanticText(input.category, 120),
      source: safeSemanticText(input.source, 180),
      retry_count: nonNegativeInteger(input.retry_count, 10_000),
    }]
  }).slice(0, 12)
}

function sanitizeChecks(value: unknown): ValidationCheck[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const input = record(item)
    if (!input) return []
    const name = safeSemanticText(input.name, 240)
    if (!name) return []
    if (typeof input.kind !== "string" || !checkKinds.has(input.kind as CheckKind)) return []
    if (typeof input.status !== "string" || !checkStatuses.has(input.status as CheckStatus)) return []
    return [{
      kind: input.kind as CheckKind,
      name,
      status: input.status as CheckStatus,
      summary: safeSemanticText(input.summary, 900),
      passed: nonNegativeInteger(input.passed),
      failed: nonNegativeInteger(input.failed),
      skipped: nonNegativeInteger(input.skipped),
      duration_ms: nonNegativeInteger(input.duration_ms, 24 * 60 * 60 * 1000),
    }]
  }).slice(0, 12)
}

export function sanitizeSemanticContext(input: SemanticContextInput): SemanticContext {
  const status = typeof input.status === "string" && statuses.has(input.status as ContextStatus)
    ? (input.status as ContextStatus)
    : "idle"

  const severity =
    typeof input.problem_severity === "string" && severities.has(input.problem_severity as ProblemSeverity)
      ? (input.problem_severity as ProblemSeverity)
      : undefined

  return {
    status,
    goal: safeSemanticText(input.goal, 900),
    current_task: safeSemanticText(input.current_task, 900),
    reason: safeSemanticText(input.reason, 1200),
    approach_summary: safeSemanticText(input.approach_summary, 1800),
    important_details: safeSemanticList(input.important_details, 16, 600),
    recent_progress: safeSemanticList(input.recent_progress, 20, 600),
    decisions: safeSemanticList(input.decisions, 20, 700),
    decision_details: sanitizeDecisionDetails(input.decision_details),
    diagnostics: sanitizeDiagnostics(input.diagnostics),
    checks: sanitizeChecks(input.checks),
    current_problem: safeSemanticText(input.current_problem, 1200),
    problem_severity: severity,
    next_step: safeSemanticText(input.next_step, 900),
    rolling_summary: safeSemanticText(input.rolling_summary, 12_000),
  }
}

export interface ContextSnapshot extends SemanticContext {
  project_id: string
  project_label?: string
  session_id: string
  repository?: string
  branch: string
  head_commit?: string
  git_dirty: boolean
  changed_files: string[]
  git_stats: GitState["stats"]
  updated_at: string
}

export function buildSnapshot(
  projectID: string,
  projectLabel: string | undefined,
  sessionID: string,
  git: GitState,
  semantic: SemanticContext,
): ContextSnapshot {
  return {
    project_id: projectID,
    project_label: projectLabel,
    session_id: sessionID,
    repository: git.repository,
    branch: git.branch,
    head_commit: git.headCommit,
    git_dirty: git.dirty,
    changed_files: git.changedFiles,
    git_stats: git.stats,
    updated_at: new Date().toISOString(),
    ...semantic,
  }
}

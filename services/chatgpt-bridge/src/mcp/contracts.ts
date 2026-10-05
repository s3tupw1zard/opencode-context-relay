import { z } from "zod";
import {
  gitStatsSchema,
  historySchema,
  activitySchema,
  decisionSchema,
  diagnosticSchema,
  diagnosticGroupSchema,
  validationSchema,
  decisionDetailSchema,
  diagnosticDetailSchema,
  checkSchema,
  VERSION,
} from "../domain/model.js";
const text = z.string().nullable();
const status = z.enum(["working", "idle", "blocked"]).nullable();
export const projectOutput = z
  .object({
    project_id: text,
    project_label: text,
    repository: text,
    aggregate_status: z
      .enum(["working", "idle", "blocked", "stale", "closed"])
      .nullable(),
    active_session_count: z.number().int(),
    fresh_session_count: z.number().int(),
    session_count: z.number().int(),
    stale_session_count: z.number().int(),
    closed_session_count: z.number().int(),
    branches: z.array(text).max(50),
    latest_activity_at: text,
  })
  .strict();
const session = z
  .object({
    project_id: text,
    session_id: text,
    status,
    lifecycle: z.enum(["active", "idle", "blocked", "stale", "closed"]),
    current_action: text,
    branch: text,
    head_commit: text,
    git_dirty: z.boolean(),
    updated_at: text,
    first_seen_at: text,
    last_seen_at: text,
    closed_at: text,
    stale: z.boolean(),
    context_stale: z.boolean(),
  })
  .strict();
const changes = session
  .extend({
    repository: text,
    changed_files: z.array(z.string()).max(30),
    git_stats: gitStatsSchema.strict(),
  })
  .strict();
const decisionDetail = decisionDetailSchema
  .extend({ decision: text, rationale: text.optional() })
  .strict();
const diagnosticDetail = diagnosticDetailSchema
  .extend({ summary: text, category: text.optional(), source: text.optional() })
  .strict();
const check = checkSchema
  .extend({ name: text, summary: text.optional() })
  .strict();
const semantic = z
  .object({
    goal: text,
    current_task: text,
    reason: text,
    approach_summary: text,
    important_details: z.array(text).max(6),
    recent_progress: z.array(text).max(6),
    decisions: z.array(text).max(6),
    decision_details: z.array(decisionDetail).max(6),
    diagnostics: z.array(diagnosticDetail).max(6),
    checks: z.array(check).max(6),
    current_problem: text,
    problem_severity: text,
    next_step: text,
    rolling_summary: text,
  })
  .strict();
const event = z
  .object({
    id: text,
    project_id: text,
    project_label: text,
    session_id: text,
    repository: text,
    branch: text,
    head_commit: text,
    event_type: text,
    summary: text,
    created_at: text,
  })
  .strict();
const base = {
  id: text,
  project_id: text,
  project_label: text,
  session_id: text,
};
const history = historySchema
  .extend({
    ...base,
    repository: text,
    branch: text,
    head_commit: text,
    current_task: text,
    approach_summary: text,
    recent_progress: z.array(text).max(6),
    current_problem: text,
    next_step: text,
    captured_at: text,
  })
  .strict();
const activity = activitySchema
  .extend({
    ...base,
    tool_name: text,
    paths: z.array(z.string()).max(8),
    created_at: text,
  })
  .strict();
const decision = decisionSchema
  .extend({
    ...base,
    decision: text,
    rationale: text,
    branch: text,
    head_commit: text,
    first_seen_at: text,
    last_seen_at: text,
  })
  .strict();
const diagnostic = diagnosticSchema
  .extend({
    ...base,
    summary: text,
    category: text,
    source: text,
    branch: text,
    head_commit: text,
    created_at: text,
  })
  .strict();
const group = diagnosticGroupSchema
  .extend({
    ...base,
    summary: text,
    category: text,
    source: text,
    branch: text,
    head_commit: text,
    created_at: text,
    first_seen_at: text,
    last_seen_at: text,
  })
  .strict();
const validation = validationSchema
  .extend({
    ...base,
    name: text,
    summary: text,
    created_at: text,
    branch: text,
    head_commit: text,
  })
  .strict();
const fullProject = projectOutput
  .extend({
    latest_important_activity: activity.nullable(),
    latest_validation: validation.nullable(),
    current_blocker: z
      .object({
        session_id: text,
        summary: text,
        context_updated_at: text,
        context_stale: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();
const error = z
  .object({
    error: z.string(),
    candidates: z.array(projectOutput).max(20).optional(),
  })
  .strict();
const page = { next_cursor: text };
export const outputs: Record<string, z.ZodType> = {
  list_projects: z
    .object({ projects: z.array(projectOutput).max(50), ...page })
    .strict(),
  get_project_status: z.object({ project: fullProject.nullable() }).strict(),
  get_active_sessions: z
    .object({ sessions: z.array(session).max(50), ...page })
    .strict(),
  get_current_context: z
    .object({
      selection: text,
      session,
      git_stats: gitStatsSchema.strict(),
      context_updated_at: text,
      context: semantic.nullable(),
    })
    .strict(),
  get_recent_events: z
    .object({ events: z.array(event).max(50), ...page })
    .strict(),
  get_project_changes: z
    .object({ sessions: z.array(changes).max(50), ...page })
    .strict(),
  get_session_history: z
    .object({ snapshots: z.array(history).max(50), ...page })
    .strict(),
  get_activity_timeline: z
    .object({ activity: z.array(activity).max(50), ...page })
    .strict(),
  get_decisions: z
    .object({ decisions: z.array(decision).max(50), ...page })
    .strict(),
  get_diagnostics: z
    .object({
      diagnostics: z.array(z.union([diagnostic, group])).max(50),
      grouped: z.boolean(),
      since: text,
      until: text,
      ...page,
    })
    .strict(),
  get_validation_runs: z
    .object({ validation_runs: z.array(validation).max(50), ...page })
    .strict(),
  health: z
    .object({
      server: z.literal("reachable"),
      storage: z.enum(["reachable", "unavailable"]),
      schema: z.enum(["compatible", "incompatible", "unverified"]),
      context_model: z.literal(2),
      version: z.literal(VERSION),
    })
    .strict(),
};
export function outputSchema(name: string) {
  return z.object({ result: z.union([outputs[name], error]) }).strict();
}

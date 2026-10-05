import { z } from "zod";
export const VERSION = "2026.1.0-dev.8";
export const text = z.string().nullable();
export const time = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v).toISOString());
// History timestamps preserve sub-millisecond precision for keyset pagination.
export const preciseTime = z.string().datetime({ offset: true });
export const count = z.number().int().nonnegative();
export const nullableCount = count.nullable();
export const statusSchema = z.enum(["working", "idle", "blocked"]);
export const severitySchema = z.enum(["info", "minor", "major", "blocked"]);
export const checkKindSchema = z.enum([
  "test",
  "build",
  "lint",
  "typecheck",
  "validation",
]);
export const checkStatusSchema = z.enum([
  "passed",
  "failed",
  "partial",
  "skipped",
]);
export const activityCategorySchema = z.enum([
  "read",
  "write",
  "search",
  "execution",
  "integration",
  "other",
  "session",
]);
export const activityTypeSchema = z.enum([
  "tool_completed",
  "tool_failed",
  "session_idle",
  "session_error",
  "session_compacted",
]);
export const gitStatsSchema = z.object(
  Object.fromEntries(
    [
      "changed_count",
      "staged_count",
      "unstaged_count",
      "untracked_count",
      "added_count",
      "modified_count",
      "deleted_count",
      "renamed_count",
      "conflicted_count",
      "ahead",
      "behind",
      "diff_insertions",
      "diff_deletions",
    ].map((k) => [k, count.optional()]),
  ) as Record<
    | "changed_count"
    | "staged_count"
    | "unstaged_count"
    | "untracked_count"
    | "added_count"
    | "modified_count"
    | "deleted_count"
    | "renamed_count"
    | "conflicted_count"
    | "ahead"
    | "behind"
    | "diff_insertions"
    | "diff_deletions",
    z.ZodOptional<typeof count>
  >,
);
export const decisionDetailSchema = z.object({
  decision: z.string(),
  rationale: z.string().optional(),
  state: z.enum(["active", "superseded"]),
});
export const diagnosticDetailSchema = z.object({
  summary: z.string(),
  severity: severitySchema,
  category: z.string().optional(),
  source: z.string().optional(),
  retry_count: count.optional(),
});
export const checkSchema = z.object({
  kind: checkKindSchema,
  name: z.string(),
  status: checkStatusSchema,
  summary: z.string().optional(),
  passed: count.optional(),
  failed: count.optional(),
  skipped: count.optional(),
  duration_ms: count.optional(),
});
export const identity = {
  project_id: z.string().min(1),
  project_label: text,
  session_id: z.string().min(1),
  repository: text,
  branch: z.string(),
  head_commit: text,
  git_dirty: z.boolean(),
  changed_files: z.array(z.string()),
  git_stats: gitStatsSchema,
  status: statusSchema,
  updated_at: time,
};
export const runtimeSchema = z.object({ ...identity, current_action: text });
export const stateSchema = z.object({
  ...identity,
  goal: text,
  current_task: text,
  reason: text,
  approach_summary: text,
  important_details: z.array(z.string()),
  recent_progress: z.array(z.string()),
  decisions: z.array(z.string()),
  decision_details: z.array(decisionDetailSchema),
  diagnostics: z.array(diagnosticDetailSchema),
  checks: z.array(checkSchema),
  current_problem: text,
  problem_severity: severitySchema.nullable(),
  next_step: text,
  rolling_summary: text,
});
export const metadataSchema = z.object({
  project_id: z.string().min(1),
  project_label: text,
  session_id: z.string().min(1),
  repository: text,
  first_seen_at: time,
  last_seen_at: time,
  last_status: statusSchema,
  last_branch: text,
  last_head_commit: text,
  last_git_dirty: z.boolean(),
  closed_at: time.nullable(),
});
export const eventSchema = z.object({
  id: z
    .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
    .transform(String),
  project_id: z.string(),
  project_label: text,
  session_id: z.string(),
  repository: text,
  branch: z.string(),
  head_commit: text,
  event_type: z.enum(["checkpoint", "blocker", "decision", "milestone"]),
  summary: z.string(),
  created_at: preciseTime,
});
const historyIdentity = {
  id: z.string().regex(/^\d+$/),
  project_id: z.string(),
  project_label: text,
  session_id: z.string(),
};
export const historySchema = z.object({
  ...historyIdentity,
  repository: text,
  branch: z.string(),
  head_commit: text,
  status: statusSchema,
  current_task: text,
  approach_summary: text,
  recent_progress: z.array(z.string()),
  current_problem: text,
  next_step: text,
  git_stats: gitStatsSchema,
  captured_at: preciseTime,
});
export const activitySchema = z.object({
  ...historyIdentity,
  event_type: activityTypeSchema,
  category: activityCategorySchema,
  tool_name: text,
  paths: z.array(z.string()),
  outcome: z.enum(["success", "error", "idle"]).nullable(),
  duration_ms: nullableCount,
  created_at: preciseTime,
});
export const decisionSchema = z.object({
  ...historyIdentity,
  decision: z.string(),
  rationale: text,
  state: z.enum(["active", "superseded"]),
  branch: text,
  head_commit: text,
  first_seen_at: preciseTime,
  last_seen_at: preciseTime,
});
export const diagnosticSchema = z.object({
  ...historyIdentity,
  summary: z.string(),
  category: text,
  severity: severitySchema,
  source: text,
  retry_count: nullableCount,
  branch: text,
  head_commit: text,
  created_at: preciseTime,
});
export const diagnosticGroupSchema = diagnosticSchema.extend({
  occurrence_count: count,
  first_seen_at: preciseTime,
  last_seen_at: preciseTime,
});
export const validationSchema = z.object({
  ...historyIdentity,
  kind: checkKindSchema,
  name: z.string(),
  status: checkStatusSchema,
  summary: text,
  passed: nullableCount,
  failed: nullableCount,
  skipped: nullableCount,
  duration_ms: nullableCount,
  created_at: preciseTime,
  branch: text,
  head_commit: text,
});
export type Runtime = z.infer<typeof runtimeSchema>;
export type State = z.infer<typeof stateSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
export type Event = z.infer<typeof eventSchema>;
export type Snapshot = {
  states: State[];
  runtime: Runtime[];
  metadata?: Metadata[];
};
export const selectorSchema = z
  .object({
    project_id: z.string().min(1).max(200).optional(),
    project_label: z.string().min(1).max(200).optional(),
    repository: z.string().min(1).max(500).optional(),
  })
  .strict()
  .refine(
    (v) => Object.values(v).filter(Boolean).length === 1,
    "Choose exactly one project selector",
  );
export type Selector = z.infer<typeof selectorSchema>;
const safeCodes = new Set([
  "storage_unavailable",
  "schema_incompatible",
  "capacity_exceeded",
  "invalid_cursor",
  "invalid_time_range",
  "invalid_filter",
  "invalid_limit",
  "unknown_tool",
]);
export class SafeError extends Error {
  public code: string;
  constructor(code: string) {
    const safe = safeCodes.has(code) ? code : "internal_error";
    super(safe);
    this.code = safe;
  }
}

import { describe, expect, test } from "bun:test"
import { sanitizeSemanticContext } from "../src/context.js"

describe("sanitizeSemanticContext", () => {
  test("keeps structured safe context and drops unknown fields", () => {
    const result = sanitizeSemanticContext({
      status: "working",
      current_task: "Implement richer history",
      approach_summary: "Store sanitized structured history",
      recent_progress: ["Added snapshot history"],
      next_step: "Run tests",
      decision_details: [{
        decision: "Keep raw logs out of Supabase",
        rationale: "Structured summaries are enough",
        state: "active",
      }],
      diagnostics: [{
        summary: "One typecheck is still failing",
        severity: "minor",
        category: "typecheck",
        retry_count: 2,
      }],
      checks: [{
        kind: "test",
        name: "bridge tests",
        status: "passed",
        passed: 12,
        failed: 0,
        duration_ms: 400,
      }],
      unknown_field: "must not leak",
    } as never)

    expect(result.status).toBe("working")
    expect(result.decision_details).toHaveLength(1)
    expect(result.diagnostics[0]?.retry_count).toBe(2)
    expect(result.checks[0]?.passed).toBe(12)
    expect("unknown_field" in result).toBe(false)
  })

  test("filters secret-looking structured text", () => {
    const result = sanitizeSemanticContext({
      status: "idle",
      current_task: "Safe task",
      approach_summary: "Safe summary",
      recent_progress: [],
      next_step: "Done",
      decision_details: [{
        decision: "api_key=super-secret-value-that-must-not-leak",
        rationale: "unsafe",
      }],
      diagnostics: [{
        summary: "Bearer abcdefghijklmnopqrstuvwxyz0123456789",
        severity: "major",
      }],
      checks: [{
        kind: "test",
        name: "safe suite",
        status: "failed",
        summary: "password=hunter2",
      }],
    })

    expect(result.decision_details).toEqual([])
    expect(result.diagnostics).toEqual([])
    expect(result.checks[0]?.summary).toBeUndefined()
  })

  test("clamps numeric fields and rejects invalid enums", () => {
    const result = sanitizeSemanticContext({
      checks: [
        { kind: "test", name: "suite", status: "passed", passed: -5, duration_ms: 999999999 },
        { kind: "deploy", name: "invalid", status: "passed" },
      ],
      diagnostics: [{ summary: "Retrying", severity: "unknown", retry_count: -2 }],
    })

    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]?.passed).toBe(0)
    expect(result.checks[0]?.duration_ms).toBe(24 * 60 * 60 * 1000)
    expect(result.diagnostics[0]?.severity).toBe("info")
    expect(result.diagnostics[0]?.retry_count).toBe(0)
  })
})

import { describe, expect, test } from "bun:test"
import { classifyToolActivity, safeToolName } from "../src/activity.js"

describe("activity classification", () => {
  test("classifies common tool families", () => {
    expect(classifyToolActivity("files.read")).toBe("read")
    expect(classifyToolActivity("github.search")).toBe("search")
    expect(classifyToolActivity("apply_patch")).toBe("write")
    expect(classifyToolActivity("shell.run")).toBe("execution")
  })

  test("normalizes tool names without carrying arbitrary text", () => {
    expect(safeToolName("  github.search  ")).toBe("github.search")
    expect(safeToolName("tool with spaces / args")).toBe("tool_with_spaces___args")
  })
})

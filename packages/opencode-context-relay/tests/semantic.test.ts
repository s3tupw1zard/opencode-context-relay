import { describe, expect, test } from "bun:test"
import { CONTEXT_TOOL_OPTIONS, SEMANTIC_CONTEXT_GUIDANCE } from "../src/semantic.js"

describe("semantic context publication", () => {
  test("keeps the publisher directly visible to the model", () => {
    expect(CONTEXT_TOOL_OPTIONS).toEqual({
      namespace: "bridge",
      codemode: false,
    })
  })

  test("guides the active model to publish safe semantic checkpoints", () => {
    expect(SEMANTIC_CONTEXT_GUIDANCE).toContain("publish_context")
    expect(SEMANTIC_CONTEXT_GUIDANCE).toContain("before the final response")
    expect(SEMANTIC_CONTEXT_GUIDANCE).toContain("Never include source code")
    expect(SEMANTIC_CONTEXT_GUIDANCE).toContain("Do not publish merely")
  })
})

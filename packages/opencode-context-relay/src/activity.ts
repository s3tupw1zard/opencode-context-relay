export type ActivityCategory = "read" | "write" | "search" | "execution" | "integration" | "other"

export function safeToolName(value: unknown): string {
  if (typeof value !== "string") return "tool"
  const normalized = value.trim().replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120)
  return normalized || "tool"
}

export function classifyToolActivity(toolName: string): ActivityCategory {
  const tool = toolName.toLowerCase()

  if (/(?:^|[_.:-])(write|edit|patch|apply|replace|create|delete|move|rename)(?:$|[_.:-])/.test(tool)) {
    return "write"
  }
  if (/(?:^|[_.:-])(grep|glob|search|find|websearch|web_search)(?:$|[_.:-])/.test(tool)) {
    return "search"
  }
  if (/(?:^|[_.:-])(read|fetch|open|list|ls|cat)(?:$|[_.:-])/.test(tool)) {
    return "read"
  }
  if (/(?:^|[_.:-])(bash|shell|exec|command|run)(?:$|[_.:-])/.test(tool)) {
    return "execution"
  }
  if (/(?:^|[_.:-])(mcp|github|supabase|http|api)(?:$|[_.:-])/.test(tool)) {
    return "integration"
  }
  return "other"
}

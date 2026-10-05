export const CONTEXT_TOOL_OPTIONS = {
  namespace: "bridge",
  codemode: false,
} as const

export const SEMANTIC_CONTEXT_GUIDANCE = [
  "Context Relay is active for this OpenCode session.",
  "Keep ChatGPT's semantic working context current by using the publish_context tool in the bridge namespace.",
  "Publish a compact checkpoint once you understand a new user task, after meaningful progress, decisions, validation results or blockers, and before the final response when the semantic state has changed.",
  "Do not publish merely because this reminder is repeated or after every routine tool call.",
  "Summarize meaning rather than tool-call narration.",
  "Never include source code, diffs, raw terminal output, prompts, credentials, tokens, secrets or other sensitive values.",
].join(" ")

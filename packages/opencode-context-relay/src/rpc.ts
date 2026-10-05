import { RELAY_DATABASE_STATUSES } from "./status.js"

const emptyObjectSchema = {
  type: "object",
  additionalProperties: false,
} as const

const relayStatusSchema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: [...RELAY_DATABASE_STATUSES],
    },
    changed_at: { type: "string" },
  },
  required: ["status", "changed_at"],
  additionalProperties: false,
} as const

/**
 * Portable OpenCode RPC definition.
 *
 * This is deliberately kept as a plain structural definition instead of
 * depending on @opencode/plugin at runtime. OpenCode's RPC client/server APIs
 * consume this shape directly.
 */
export const ContextRelayRpc = {
  id: "opencode-context-relay",
  methods: {
    status: {
      input: emptyObjectSchema,
      output: relayStatusSchema,
    },
  },
  events: {
    status_changed: {
      schema: relayStatusSchema,
    },
  },
} as const

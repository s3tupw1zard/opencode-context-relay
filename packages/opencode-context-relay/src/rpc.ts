import { Rpc } from "@opencode/plugin/rpc"
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

export const ContextRelayRpc = Rpc.define({
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
})

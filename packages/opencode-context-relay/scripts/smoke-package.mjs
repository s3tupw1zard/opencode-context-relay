import assert from "node:assert/strict"

const server = await import("../dist/index.js")
const tui = await import("../dist/tui.js")
const rpc = await import("../dist/rpc.js")

assert.equal(server.default?.id, "opencode-context-relay")
assert.equal(typeof server.default?.setup, "function")

assert.equal(tui.default?.id, "opencode-context-relay.tui")
assert.equal(typeof tui.default?.setup, "function")

assert.equal(rpc.ContextRelayRpc?.id, "opencode-context-relay")
assert.equal(typeof rpc.ContextRelayRpc?.methods?.status, "object")
assert.equal(typeof rpc.ContextRelayRpc?.events?.status_changed, "object")

console.log("Published server, TUI, and RPC entrypoints load successfully.")

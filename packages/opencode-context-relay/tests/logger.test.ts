import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BridgeLogger } from "../src/logger.js"

describe("BridgeLogger", () => {
  test("writes at the configured level and redacts credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencode-context-bridge-"))
    const path = join(directory, "bridge.log")
    try {
      const logger = new BridgeLogger("info", path)
      logger.debug("hidden debug entry", { value: "not-written" })
      logger.info("database configured", {
        databaseUrl: "postgresql://writer:secret@db.internal/context_bridge",
        error: new Error("failed for postgresql://writer:secret@db.internal/context_bridge"),
      })
      await logger.flush()

      const log = await readFile(path, "utf8")
      expect(log).toContain('"level":"info"')
      expect(log).not.toContain("hidden debug entry")
      expect(log).not.toContain("secret")
      expect(log).toContain("[REDACTED]")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

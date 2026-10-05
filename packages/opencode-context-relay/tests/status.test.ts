import { describe, expect, test } from "bun:test"
import {
  createRelayStatus,
  isRelayStatusSnapshot,
  noticeForRelayStatus,
} from "../src/status.js"

describe("relay status", () => {
  test("validates relay status snapshots", () => {
    const snapshot = createRelayStatus("connected", new Date("2026-10-05T00:00:00.000Z"))
    expect(isRelayStatusSnapshot(snapshot)).toBe(true)
    expect(isRelayStatusSnapshot({ status: "unknown", changed_at: snapshot.changed_at })).toBe(false)
  })

  test("keeps healthy startup silent", () => {
    expect(noticeForRelayStatus(undefined, "checking", true)).toBeUndefined()
    expect(noticeForRelayStatus(undefined, "connected", true)).toBeUndefined()
  })

  test("shows an unavailable database immediately", () => {
    const notice = noticeForRelayStatus(undefined, "unavailable", true)
    expect(notice?.variant).toBe("error")
    expect(notice?.message).toContain("PostgreSQL connection failed")
  })

  test("does not repeat a notice for the same status", () => {
    expect(noticeForRelayStatus("unavailable", "unavailable")).toBeUndefined()
  })

  test("shows recovery only after a real failure state", () => {
    expect(noticeForRelayStatus("checking", "connected")).toBeUndefined()
    const notice = noticeForRelayStatus("unavailable", "connected")
    expect(notice?.variant).toBe("success")
    expect(notice?.message).toContain("restored")
  })
})

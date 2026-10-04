import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { isSensitivePath, safePath } from "./privacy.js"

const execFileAsync = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  })
  return stdout.trim()
}

export interface GitStats {
  changed_count: number
  staged_count: number
  unstaged_count: number
  untracked_count: number
  added_count: number
  modified_count: number
  deleted_count: number
  renamed_count: number
  conflicted_count: number
  ahead: number
  behind: number
  diff_insertions: number
  diff_deletions: number
}

export interface GitState {
  repository?: string
  branch: string
  headCommit?: string
  dirty: boolean
  changedFiles: string[]
  sensitivePaths: string[]
  fingerprint: string
  stats: GitStats
}

function emptyStats(): GitStats {
  return {
    changed_count: 0,
    staged_count: 0,
    unstaged_count: 0,
    untracked_count: 0,
    added_count: 0,
    modified_count: 0,
    deleted_count: 0,
    renamed_count: 0,
    conflicted_count: 0,
    ahead: 0,
    behind: 0,
    diff_insertions: 0,
    diff_deletions: 0,
  }
}

function parseGithubRepository(remote: string): string | undefined {
  const ssh = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i)
  return ssh?.[1]
}

function parseAheadBehind(value: string): { ahead: number; behind: number } {
  const [behindRaw, aheadRaw] = value.split(/\s+/)
  const behind = Number.parseInt(behindRaw ?? "", 10)
  const ahead = Number.parseInt(aheadRaw ?? "", 10)
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  }
}

function parseNumstat(...values: string[]): { insertions: number; deletions: number } {
  let insertions = 0
  let deletions = 0
  for (const value of values) {
    for (const line of value.split("\n").filter(Boolean)) {
      const [added, removed] = line.split("\t")
      if (added !== "-") insertions += Number.parseInt(added ?? "0", 10) || 0
      if (removed !== "-") deletions += Number.parseInt(removed ?? "0", 10) || 0
    }
  }
  return { insertions, deletions }
}

export function summarizePorcelain(
  status: string,
  aheadBehind = "",
  unstagedNumstat = "",
  stagedNumstat = "",
): GitStats {
  const stats = emptyStats()
  const lines = status.split("\n").filter(Boolean)
  const conflicts = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"])

  stats.changed_count = lines.length

  for (const line of lines) {
    const code = line.slice(0, 2)
    const x = code[0] ?? " "
    const y = code[1] ?? " "

    if (code === "??") {
      stats.untracked_count += 1
      continue
    }
    if (x !== " " && x !== "?") stats.staged_count += 1
    if (y !== " " && y !== "?") stats.unstaged_count += 1
    if (code.includes("A")) stats.added_count += 1
    if (code.includes("M")) stats.modified_count += 1
    if (code.includes("D")) stats.deleted_count += 1
    if (code.includes("R")) stats.renamed_count += 1
    if (conflicts.has(code)) stats.conflicted_count += 1
  }

  const tracking = parseAheadBehind(aheadBehind)
  stats.ahead = tracking.ahead
  stats.behind = tracking.behind

  const diff = parseNumstat(unstagedNumstat, stagedNumstat)
  stats.diff_insertions = diff.insertions
  stats.diff_deletions = diff.deletions
  return stats
}

export async function readGitState(cwd: string): Promise<GitState> {
  try {
    const [branch, headCommit, status, remote, tracking, unstagedNumstat, stagedNumstat] = await Promise.all([
      git(cwd, ["branch", "--show-current"]),
      git(cwd, ["rev-parse", "HEAD"]).catch(() => ""),
      git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]),
      git(cwd, ["remote", "get-url", "origin"]).catch(() => ""),
      git(cwd, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]).catch(() => ""),
      git(cwd, ["diff", "--numstat"]).catch(() => ""),
      git(cwd, ["diff", "--cached", "--numstat"]).catch(() => ""),
    ])

    const rawPaths = status
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3).split(" -> ").at(-1) ?? "")

    const sensitivePaths = rawPaths
      .filter((path) => isSensitivePath(path))
      .slice(0, 24)

    const changedFiles = rawPaths
      .map(safePath)
      .filter((path): path is string => Boolean(path))
      .slice(0, 128)

    const fingerprint = createHash("sha256")
      .update(status)
      .digest("hex")
      .slice(0, 24)

    return {
      repository: parseGithubRepository(remote),
      branch: branch || "HEAD",
      headCommit: headCommit || undefined,
      dirty: status.length > 0,
      changedFiles,
      sensitivePaths,
      fingerprint,
      stats: summarizePorcelain(status, tracking, unstagedNumstat, stagedNumstat),
    }
  } catch {
    return {
      branch: "unknown",
      dirty: false,
      changedFiles: [],
      sensitivePaths: [],
      fingerprint: "not-a-git-repository",
      stats: emptyStats(),
    }
  }
}

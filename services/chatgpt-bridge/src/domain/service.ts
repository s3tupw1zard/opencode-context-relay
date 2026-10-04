import type { Storage, Query } from "../storage/types.js";
import {
  SafeError,
  VERSION,
  type Selector,
  type Runtime,
  type State,
  type Snapshot,
  type Metadata,
} from "./model.js";
type Session = Runtime & {
  stale: boolean;
  context_stale: boolean;
  closed: boolean;
  lifecycle: "active" | "idle" | "blocked" | "stale" | "closed";
  first_seen_at: string | null;
  last_seen_at: string;
  closed_at: string | null;
  state?: State;
};
export type ToolArgs = {
  project?: Selector;
  session_id?: string;
  limit?: number;
  cursor?: string;
  event_type?: string;
  since?: string;
  until?: string;
  category?: string;
  state?: string;
  severity?: string;
  kind?: string;
  status?: string;
  group_by_problem?: boolean;
};
export class ContextService {
  constructor(
    private storage: Storage,
    private staleMs = 900000,
    private now = () => Date.now(),
  ) {}
  private stale(timestamp: string) {
    const age = this.now() - Date.parse(timestamp);
    return age > this.staleMs || age < -60000;
  }
  private sessions(snapshot: Snapshot): Session[] {
    const map = new Map<string, Session>();
    const metadata = new Map(
      (snapshot.metadata ?? []).map((m) => [
        JSON.stringify([m.project_id, m.session_id]),
        m,
      ]),
    );
    const add = (row: Runtime | State) => {
      const key = JSON.stringify([row.project_id, row.session_id]),
        prev = map.get(key),
        state = "goal" in row ? row : prev?.state,
        latest =
          !prev || Date.parse(row.updated_at) >= Date.parse(prev.updated_at)
            ? row
            : prev;
      map.set(key, {
        ...latest,
        current_action:
          "current_action" in latest ? latest.current_action : null,
        state,
        stale: this.stale(latest.updated_at),
        context_stale: !state || this.stale(state.updated_at),
        closed: false,
        lifecycle: "idle",
        first_seen_at: null,
        last_seen_at: latest.updated_at,
        closed_at: null,
      });
    };
    for (const row of [...snapshot.states, ...snapshot.runtime]) add(row);
    for (const [key, m] of metadata) {
      if (!map.has(key))
        add({
          project_id: m.project_id,
          project_label: m.project_label,
          session_id: m.session_id,
          repository: m.repository,
          branch: m.last_branch ?? "unknown",
          head_commit: m.last_head_commit,
          git_dirty: m.last_git_dirty,
          git_stats: {},
          changed_files: [],
          status: m.last_status,
          current_action: null,
          updated_at: m.last_seen_at,
        });
    }
    for (const [key, s] of map) {
      const m: Metadata | undefined = metadata.get(key);
      if (m) {
        s.first_seen_at = m.first_seen_at;
        s.last_seen_at =
          Date.parse(m.last_seen_at) > Date.parse(s.updated_at)
            ? m.last_seen_at
            : s.updated_at;
        s.closed_at = m.closed_at;
        s.closed = Boolean(
          m.closed_at && Date.parse(m.closed_at) >= Date.parse(s.last_seen_at),
        );
        if (Date.parse(m.last_seen_at) > Date.parse(s.updated_at)) {
          s.status = m.last_status;
          s.branch = m.last_branch ?? s.branch;
          s.head_commit = m.last_head_commit;
          s.git_dirty = m.last_git_dirty;
          s.current_action = null;
        }
        s.project_label = m.project_label ?? s.project_label;
        s.repository = m.repository ?? s.repository;
      }
      s.stale = this.stale(s.last_seen_at);
      s.lifecycle = s.closed
        ? "closed"
        : s.stale
          ? "stale"
          : s.status === "working"
            ? "active"
            : s.status;
    }
    return [...map.values()].sort((a, b) =>
      JSON.stringify([a.project_id, a.session_id]) <
      JSON.stringify([b.project_id, b.session_id])
        ? -1
        : 1,
    );
  }
  private compact(s: Session) {
    return {
      project_id: s.project_id,
      session_id: s.session_id,
      status: s.status,
      lifecycle: s.lifecycle,
      current_action: s.current_action,
      branch: s.branch,
      head_commit: s.head_commit,
      git_dirty: s.git_dirty,
      updated_at: s.updated_at,
      first_seen_at: s.first_seen_at,
      last_seen_at: s.last_seen_at,
      closed_at: s.closed_at,
      stale: s.stale,
      context_stale: s.context_stale,
    };
  }
  private project(rows: Session[]) {
    const sorted = [...rows].sort(
        (a, b) =>
          Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at) ||
          a.session_id.localeCompare(b.session_id),
      ),
      fresh = rows.filter((s) => !s.stale && !s.closed),
      statuses = fresh.map((s) => s.status);
    return {
      project_id: rows[0].project_id,
      project_label: sorted.find((s) => s.project_label)?.project_label ?? null,
      repository: sorted.find((s) => s.repository)?.repository ?? null,
      aggregate_status: statuses.includes("blocked")
        ? "blocked"
        : statuses.includes("working")
          ? "working"
          : fresh.length
            ? "idle"
            : rows.every((s) => s.closed)
              ? "closed"
              : "stale",
      active_session_count: fresh.filter((s) => s.status === "working").length,
      fresh_session_count: fresh.length,
      session_count: rows.length,
      stale_session_count: rows.filter((s) => s.stale && !s.closed).length,
      closed_session_count: rows.filter((s) => s.closed).length,
      branches: [...new Set(rows.map((s) => s.branch))].sort(),
      latest_activity_at: sorted[0].last_seen_at,
    };
  }
  private resolve(
    rows: Session[],
    selector?: Selector,
  ): Session[] | { error: string; candidates?: unknown[] } {
    if (!selector) return rows;
    const entry = Object.entries(selector).find(([, v]) => v !== undefined);
    if (!entry) return { error: "project_not_found" };
    const [key, value] = entry,
      ids = [
        ...new Set(
          rows
            .filter((s) => s[key as keyof Session] === value)
            .map((s) => s.project_id),
        ),
      ];
    if (!ids.length) return { error: "project_not_found" };
    if (ids.length > 1)
      return {
        error: "ambiguous_project",
        candidates: ids
          .slice(0, 20)
          .map((id) => this.project(rows.filter((s) => s.project_id === id))),
      };
    return rows.filter((s) => s.project_id === ids[0]);
  }
  async call(name: string, args: ToolArgs) {
    if (name === "health") {
      try {
        return {
          server: "reachable",
          ...(await this.storage.checkSchema()),
          context_model: 2,
          version: VERSION,
        };
      } catch {
        return {
          server: "reachable",
          storage: "unavailable",
          schema: "unverified",
          context_model: 2,
          version: VERSION,
        };
      }
    }
    const limit = args.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new SafeError("invalid_limit");
    if (
      (args.since && !Number.isFinite(Date.parse(args.since))) ||
      (args.until && !Number.isFinite(Date.parse(args.until))) ||
      (args.since &&
        args.until &&
        Date.parse(args.since) >= Date.parse(args.until))
    )
      throw new SafeError("invalid_time_range");
    const rows = this.resolve(
      this.sessions(await this.storage.snapshot()),
      args.project,
    );
    if (!Array.isArray(rows)) return rows;
    if (args.session_id && !rows.some((s) => s.session_id === args.session_id))
      return { error: "session_not_found" };
    const query: Query = {
      ...args,
      project_id: rows[0]?.project_id ?? "",
      limit,
    };
    delete (query as Query & { project?: Selector }).project;
    switch (name) {
      case "get_session_history": {
        const page = await this.storage.sessionHistory(query);
        return {
          snapshots: page.items.map((s) => ({
            ...s,
            recent_progress: s.recent_progress.slice(0, 6),
          })),
          next_cursor: page.next_cursor,
        };
      }
      case "get_activity_timeline": {
        const page = await this.storage.activity(query);
        return {
          activity: page.items.map((a) => ({
            ...a,
            paths: a.paths.slice(0, 8),
          })),
          next_cursor: page.next_cursor,
        };
      }
      case "get_decisions": {
        const page = await this.storage.decisions(query);
        return { decisions: page.items, next_cursor: page.next_cursor };
      }
      case "get_diagnostics": {
        const page = await this.storage.diagnostics(query);
        return {
          diagnostics: page.items,
          grouped: args.group_by_problem ?? false,
          since: args.since ?? null,
          until: args.until ?? null,
          next_cursor: page.next_cursor,
        };
      }
      case "get_validation_runs": {
        const page = await this.storage.validations(query);
        return { validation_runs: page.items, next_cursor: page.next_cursor };
      }
    }
    if (name === "get_recent_events") {
      if (!rows.length) return { events: [], next_cursor: null };
      const events = await this.storage.events(
        rows[0].project_id,
        args.session_id,
        args.event_type,
        limit + 1,
        args.cursor,
      );
      return {
        events: events.slice(0, limit),
        next_cursor: events.length > limit ? events[limit - 1].id : null,
      };
    }
    if (name === "list_projects") {
      const ids = [...new Set(rows.map((s) => s.project_id))]
        .sort()
        .filter((id) => !args.cursor || id > args.cursor);
      return {
        projects: ids
          .slice(0, limit)
          .map((id) => this.project(rows.filter((s) => s.project_id === id))),
        next_cursor: ids.length > limit ? ids[limit - 1] : null,
      };
    }
    if (name === "get_project_status") {
      if (!rows.length) return { project: null };
      const [activity, validation] = await Promise.all([
        this.storage.activity({ project_id: rows[0].project_id, limit: 1 }),
        this.storage.validations({ project_id: rows[0].project_id, limit: 1 }),
      ]);
      const blocker = rows
        .filter(
          (s) =>
            !s.closed &&
            !s.stale &&
            s.status === "blocked" &&
            s.state?.current_problem,
        )
        .sort(
          (a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at),
        )[0];
      return {
        project: {
          ...this.project(rows),
          latest_important_activity: activity.items[0]
            ? {
                ...activity.items[0],
                paths: activity.items[0].paths.slice(0, 8),
              }
            : null,
          latest_validation: validation.items[0] ?? null,
          current_blocker: blocker
            ? {
                session_id: blocker.session_id,
                summary: blocker.state!.current_problem,
                context_updated_at: blocker.state!.updated_at,
                context_stale: blocker.context_stale,
              }
            : null,
        },
      };
    }
    const chosen = rows.filter(
      (s) => !args.session_id || s.session_id === args.session_id,
    );
    if (name === "get_current_context") {
      const ranked = [...chosen].sort(
          (a, b) =>
            Number(a.closed) - Number(b.closed) ||
            Number(a.stale) - Number(b.stale) ||
            { blocked: 0, working: 1, idle: 2 }[a.status] -
              { blocked: 0, working: 1, idle: 2 }[b.status] ||
            Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at) ||
            a.session_id.localeCompare(b.session_id),
        ),
        s = ranked[0];
      if (!s) return { error: "context_not_found" };
      const state = s.state;
      return {
        selection:
          "open before closed, fresh before stale, blocked > working > idle, latest activity, session_id",
        session: this.compact(s),
        git_stats: s.git_stats,
        context_updated_at: state?.updated_at ?? null,
        context: state
          ? {
              goal: state.goal,
              current_task: state.current_task,
              reason: state.reason,
              approach_summary: state.approach_summary,
              important_details: state.important_details.slice(0, 6),
              recent_progress: state.recent_progress.slice(0, 6),
              decisions: state.decisions.slice(0, 6),
              decision_details: state.decision_details.slice(0, 6),
              diagnostics: state.diagnostics.slice(0, 6),
              checks: state.checks.slice(0, 6),
              current_problem: state.current_problem,
              problem_severity: state.problem_severity,
              next_step: state.next_step,
              rolling_summary: state.rolling_summary,
            }
          : null,
      };
    }
    if (!["get_active_sessions", "get_project_changes"].includes(name))
      throw new SafeError("unknown_tool");
    const paged = chosen.filter(
      (s) =>
        !args.cursor ||
        JSON.stringify([s.project_id, s.session_id]) > args.cursor,
    );
    return {
      sessions: paged
        .slice(0, limit)
        .map((s) =>
          name === "get_project_changes"
            ? {
                ...this.compact(s),
                repository: s.repository,
                changed_files: s.changed_files.slice(0, 30),
                git_stats: s.git_stats,
              }
            : this.compact(s),
        ),
      next_cursor:
        paged.length > limit
          ? JSON.stringify([
              paged[limit - 1].project_id,
              paged[limit - 1].session_id,
            ])
          : null,
    };
  }
}

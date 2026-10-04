BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'context_bridge_reader') THEN
    CREATE ROLE context_bridge_reader
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE context_bridge_reader PASSWORD :'reader_password';
ALTER ROLE context_bridge_reader SET default_transaction_read_only = on;
ALTER ROLE context_bridge_reader SET statement_timeout = '5s';

SELECT format(
  'GRANT CONNECT ON DATABASE %I TO context_bridge_reader',
  current_database()
) \gexec

GRANT USAGE ON SCHEMA context_bridge TO context_bridge_reader;

REVOKE ALL ON context_bridge.agent_state FROM context_bridge_reader;
GRANT SELECT (
  project_id, project_label, session_id, repository, branch, head_commit,
  git_dirty, changed_files, git_stats, status, updated_at, goal, current_task,
  reason, approach_summary, important_details, recent_progress, decisions,
  decision_details, diagnostics, checks, current_problem, problem_severity,
  next_step, rolling_summary
) ON context_bridge.agent_state TO context_bridge_reader;

REVOKE ALL ON context_bridge.agent_runtime FROM context_bridge_reader;
GRANT SELECT (
  project_id, project_label, session_id, repository, branch, head_commit,
  git_dirty, changed_files, git_stats, status, updated_at, current_action
) ON context_bridge.agent_runtime TO context_bridge_reader;

REVOKE ALL ON context_bridge.session_metadata FROM context_bridge_reader;
GRANT SELECT (
  project_id, project_label, session_id, repository, first_seen_at,
  last_seen_at, last_status, last_branch, last_head_commit, last_git_dirty,
  closed_at
) ON context_bridge.session_metadata TO context_bridge_reader;

REVOKE ALL ON context_bridge.work_events FROM context_bridge_reader;
GRANT SELECT (
  id, project_id, project_label, session_id, repository, branch, head_commit,
  event_type, summary, created_at
) ON context_bridge.work_events TO context_bridge_reader;

REVOKE ALL ON context_bridge.session_snapshots FROM context_bridge_reader;
GRANT SELECT (
  id, project_id, project_label, session_id, repository, branch, head_commit,
  status, current_task, approach_summary, recent_progress, current_problem,
  next_step, git_stats, captured_at
) ON context_bridge.session_snapshots TO context_bridge_reader;

REVOKE ALL ON context_bridge.activity_events FROM context_bridge_reader;
GRANT SELECT (
  id, project_id, project_label, session_id, event_type, category, tool_name,
  paths, outcome, duration_ms, created_at
) ON context_bridge.activity_events TO context_bridge_reader;

REVOKE ALL ON context_bridge.decision_log FROM context_bridge_reader;
GRANT SELECT (
  id, project_id, project_label, session_id, decision, rationale, state,
  branch, head_commit, first_seen_at, last_seen_at
) ON context_bridge.decision_log TO context_bridge_reader;

REVOKE ALL ON context_bridge.diagnostic_events FROM context_bridge_reader;
GRANT SELECT (
  id, project_id, project_label, session_id, summary, category, severity,
  source, retry_count, branch, head_commit, created_at, diagnostic_key
) ON context_bridge.diagnostic_events TO context_bridge_reader;

REVOKE ALL ON context_bridge.validation_runs FROM context_bridge_reader;
GRANT SELECT (
  id, project_id, project_label, session_id, kind, name, status, summary,
  passed, failed, skipped, duration_ms, created_at, branch, head_commit
) ON context_bridge.validation_runs TO context_bridge_reader;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_state',
    'agent_runtime',
    'session_metadata',
    'work_events',
    'session_snapshots',
    'activity_events',
    'decision_log',
    'diagnostic_events',
    'validation_runs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE context_bridge.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS context_bridge_reader_select ON context_bridge.%I', t);
    EXECUTE format(
      'CREATE POLICY context_bridge_reader_select ON context_bridge.%I FOR SELECT TO context_bridge_reader USING (true)',
      t
    );
  END LOOP;
END
$$;

REVOKE ALL ON context_bridge.browser_context FROM context_bridge_reader;
REVOKE ALL ON context_bridge.schema_migrations FROM context_bridge_reader;

COMMIT;

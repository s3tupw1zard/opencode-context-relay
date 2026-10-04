BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'context_bridge_writer') THEN
    CREATE ROLE context_bridge_writer
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

ALTER ROLE context_bridge_writer SET statement_timeout = '5s';

REVOKE ALL ON SCHEMA context_bridge FROM PUBLIC;
GRANT USAGE ON SCHEMA context_bridge TO context_bridge_writer;

GRANT SELECT, INSERT, UPDATE ON
  context_bridge.agent_state,
  context_bridge.agent_runtime,
  context_bridge.session_metadata,
  context_bridge.session_snapshots,
  context_bridge.activity_events,
  context_bridge.decision_log,
  context_bridge.diagnostic_events,
  context_bridge.validation_runs,
  context_bridge.work_events,
  context_bridge.browser_context
TO context_bridge_writer;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA context_bridge TO context_bridge_writer;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_state',
    'agent_runtime',
    'session_metadata',
    'session_snapshots',
    'activity_events',
    'decision_log',
    'diagnostic_events',
    'validation_runs',
    'work_events',
    'browser_context'
  ]
  LOOP
    EXECUTE format('ALTER TABLE context_bridge.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS context_bridge_writer_rw ON context_bridge.%I', t);
    EXECUTE format(
      'CREATE POLICY context_bridge_writer_rw ON context_bridge.%I FOR ALL TO context_bridge_writer USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END
$$;

DO $
BEGIN
  IF to_regclass('context_bridge.schema_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON context_bridge.schema_migrations FROM context_bridge_writer';
  END IF;
END
$;

COMMIT;

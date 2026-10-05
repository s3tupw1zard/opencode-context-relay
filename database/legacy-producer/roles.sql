-- Run as a PostgreSQL administrator after postgres/schema.sql.
-- Set the password interactively with: \\password context_bridge_writer

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'context_bridge_writer') THEN
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

GRANT CONNECT ON DATABASE context_bridge TO context_bridge_writer;
GRANT USAGE ON SCHEMA context_bridge TO context_bridge_writer;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA context_bridge TO context_bridge_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA context_bridge TO context_bridge_writer;

ALTER DEFAULT PRIVILEGES
  FOR ROLE postgres
  IN SCHEMA context_bridge
  GRANT SELECT, INSERT, UPDATE ON TABLES TO context_bridge_writer;

ALTER DEFAULT PRIVILEGES
  FOR ROLE postgres
  IN SCHEMA context_bridge
  GRANT USAGE, SELECT ON SEQUENCES TO context_bridge_writer;

ALTER ROLE context_bridge_writer SET statement_timeout = '5s';

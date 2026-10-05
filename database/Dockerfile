FROM postgres:17

LABEL org.opencontainers.image.source="https://github.com/s3tupw1zard/opencode-context-relay"
LABEL org.opencontainers.image.description="Versioned PostgreSQL migrator for OpenCode Context Relay"

COPY migrate.sh /database/migrate.sh
COPY migrations /database/migrations
COPY roles /database/roles

ENTRYPOINT ["/bin/sh", "/database/migrate.sh"]

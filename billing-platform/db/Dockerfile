# The database service.
#
# Plain PostgreSQL with a few server defaults pinned. The schema is not built
# into the image: it is applied by the backend's migration runner
# (`npm run migrate`), so one image serves every environment, an upgrade is a
# migration rather than a rebuild, and a managed database — Neon, Supabase, RDS —
# ends up with exactly the same schema as this container.
FROM postgres:17-alpine

# Deterministic collation. Left to the host's locale, ORDER BY on text can sort
# differently between machines, so the same query would return rows in a
# different order in production than in development.
ENV LANG=C.UTF-8
ENV POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale=C"

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD pg_isready -U "${POSTGRES_USER:-billing}" -d "${POSTGRES_DB:-billing}" || exit 1

# Server settings rather than an init script: these are configuration, and
# configuration set at start-up applies to an existing data directory too. An
# init script only ever runs against an empty one, so a change there would
# silently not reach any database that already exists.
#
# Timestamps are stored WITH TIME ZONE and rendered in the browser; pinning the
# server to UTC means a client that forgets to set it still reads and writes the
# same instant.
CMD ["postgres", "-c", "timezone=UTC", "-c", "datestyle=ISO, YMD"]

# Database

PostgreSQL 17. This directory holds the **service**; it does not hold the schema.

## Where the schema actually lives

`../backend/src/db/migrations/*.sql` is the single source of truth, applied by
the backend's migration runner:

```bash
cd ../backend
npm run migrate
```

That is deliberate. If the schema were also duplicated here as a `schema.sql`,
the two copies would drift the first time someone added a column, and there
would be no way to tell which one a given database had actually seen. The
runner records what it has applied in an `applied_migrations` table, so it is
safe to run on every deploy — including against a database that is already up
to date.

The ledger guards (`../backend/src/db/ledger-guards.sql`) are re-applied on
every run. They are written to be idempotent so they cannot drift behind the
code that depends on them.

## What the database enforces

The interesting invariants are in the database, not only in the application:

- **Journal entries balance.** A deferred constraint trigger checks that debits
  equal credits at commit time, so an unbalanced entry cannot be committed by
  any client, including `psql`.
- **Posted documents and their entries are append-only.** Triggers refuse an
  UPDATE or DELETE on a posted document or on a journal line. A correction adds
  a reversing entry; it never edits history. The single exception is the
  e-invoice stamp (IRN, acknowledgement number and date, signed QR), which is
  write-once on an otherwise unchanged row.
- **Document numbers are gapless.** The number series row is taken `FOR UPDATE`
  inside the posting transaction, so two concurrent posts serialise instead of
  racing for the same number.
- **Money is integer paise.** `bigint` columns throughout — no `float`, no
  `numeric` rounding surprises.

## Running it

With Compose, from the repository root:

```bash
docker compose up -d db
```

Standalone:

```bash
docker build -t billing-db .
docker run -d --name billing-db \
  -e POSTGRES_USER=billing \
  -e POSTGRES_PASSWORD=change-me \
  -e POSTGRES_DB=billing \
  -p 5432:5432 \
  -v billing-data:/var/lib/postgresql/data \
  billing-db
```

The connection string the backend then wants is:

```
DATABASE_URL=postgres://billing:change-me@localhost:5432/billing
```

## Using a managed database instead

Nothing in the application depends on this container. Point `DATABASE_URL` at
any PostgreSQL 13 or newer instance and run `npm run migrate` against it.

- **Neon / Supabase / RDS**: use the connection string they give you. Append
  `?sslmode=require` if it is not already there.
- **Connection limits**: set `DATABASE_POOL_MAX` to something below the plan's
  limit. The default of 10 is fine for a single backend instance on a small
  plan; a serverless database with a pooler usually wants it lower.
- Version 13 is the floor because the schema defaults primary keys to
  `gen_random_uuid()`, which entered core in 13. The guards also use deferred
  constraint triggers and `FILTER` aggregates, both long-standing.

## Backups

The whole state of the system is in this one database — the application holds
no files of its own, and PDFs are generated on demand rather than stored.

```bash
# Take one
docker compose exec db pg_dump -U billing -d billing --format=custom > billing.dump

# Put it back
docker compose exec -T db pg_restore -U billing -d billing --clean --if-exists < billing.dump
```

Test the restore before you need it. A backup nobody has restored is a
hypothesis, not a backup.

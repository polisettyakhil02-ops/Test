# Backend

Express 5 API, the double-entry ledger, reports, PDF and CSV export.

```bash
npm install
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm run migrate
npm run dev                   # :4000
```

No PostgreSQL to hand? `npm run dev:db` runs a real PostgreSQL server
in-process (PGlite over the wire protocol) on `:5432`. It serves one connection
at a time, so set `DATABASE_POOL_MAX=1` when pointing at it. That is a property
of the harness, not of the application.

## Scripts

| | |
| --- | --- |
| `npm run dev` | watch mode |
| `npm run build` | typecheck, bundle to `dist/`, copy the migration SQL |
| `npm start` | run the build |
| `npm run migrate` | apply pending migrations and re-apply the ledger guards |
| `npm run setup -- --email … --password … --company … --state …` | first-time setup: schema, entity, chart of accounts, periods, number series, admin user |
| `npm run entity` | edit the business details |
| `npm run demo` | seed demo clients, items and documents |
| `npm run outbox` | run the webhook delivery worker |
| `npm test` | 88 tests against real PostgreSQL, in-process |
| `npm run typecheck` / `npm run lint` | |

`setup` is safe to re-run: it will not duplicate the entity, and re-running with
an existing email resets that user's password. That is also how you recover a
lost admin login.

## Layout

```
src/
  index.ts        createApp(), CORS, health check, route mounting
  routes/         auth, masters, documents, reports, outbox
  domain/         posting, pricing, money, reports, gst-returns, statements,
                  einvoice, webhooks — the parts with no HTTP in them
  db/             drizzle schema, migrations, ledger-guards.sql
  lib/            config, validation, queries, errors, QR
  middleware/     session handling and role checks
  pdf/            the invoice document
  scripts/        the CLI entry points above
test/             one file per domain area
```

The domain modules take a database handle and plain values, and return plain
values. Nothing in `domain/` knows what a request is, which is why the tests can
exercise the interesting logic without a server.

## Money

Integer paise (`bigint`) everywhere — in the database, over the wire, and in
every calculation. There is no floating-point arithmetic anywhere in the money
path. Discounts are apportioned across lines by largest remainder, so the parts
always sum to exactly the whole.

## Errors

`src/lib/errors.ts` turns each failure into one shape: `{ error, fieldErrors }`.

- a Zod failure becomes a 400 with per-field messages the form can display;
- a `PostingError` becomes a 409;
- a trigger violation becomes a 409 carrying the database's own message,
  because the database is the authority on why it refused;
- anything else is a 500 with a generic message, logged in full server-side.

## Tests

```bash
npm test
```

They run PostgreSQL in-process via PGlite, apply the real migrations and the
real `ledger-guards.sql`, and then try to break the invariants: unbalanced
entries, edits to posted documents, concurrent numbering. A mock would pass
those tests without proving anything.

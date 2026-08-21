# Backend

Express 5 API, the double-entry ledger, reports, PDF and CSV export.

```bash
npm install
cp .env.example .env          # set MONGODB_URI and JWT_SECRET
npm run migrate
npm run dev                   # :4000
```

No MongoDB replica set to hand? `npm run dev:db` runs a real one in-process
(`mongodb-memory-server`, a real downloaded `mongod`, not an emulator) on
`:27017` and prints the `MONGODB_URI` to use. A single-node replica set, not a
standalone server: this application posts everything inside a multi-document
transaction, and MongoDB refuses transactions outright without one.

## Scripts

| | |
| --- | --- |
| `npm run dev` | watch mode |
| `npm run build` | typecheck, bundle to `dist/` |
| `npm start` | run the build |
| `npm run migrate` | ensure every index and document validator exists — idempotent, safe on every deploy |
| `npm run setup -- --email … --password … --company … --state …` | first-time setup: entity, chart of accounts, periods, number series, admin user |
| `npm run entity` | edit the business details |
| `npm run demo` | seed demo clients, items and documents |
| `npm run outbox` | run the webhook delivery worker |
| `npm test` | 92 tests against a real MongoDB replica set, in-process |
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
  db/             collection types, the Mongo client, indexes and validators
  lib/            config, validation, queries, errors, QR
  middleware/     session handling and role checks
  pdf/            the invoice document
  scripts/        the CLI entry points above
test/             one file per domain area
```

The domain modules take a `Store` (the Mongo collections, plus the current
transaction's session, if any) and plain values, and return plain values.
Nothing in `domain/` knows what a request is, which is why the tests can
exercise the interesting logic without a server.

There is no `schema.ts` and no migration files: MongoDB has no schema to
declare ahead of time, only the indexes and validators `db/indexes.ts` ensures
at boot. A document, a journal entry and their lines are TypeScript interfaces
in `db/collections.ts` — the types are enforced by the compiler on the way in,
and by a handful of validators in MongoDB itself on the way to disk.

## Money

Integer paise everywhere — in MongoDB, over the wire, and in every
calculation. There is no floating-point arithmetic anywhere in the money path.
Discounts are apportioned across lines by largest remainder, so the parts
always sum to exactly the whole.

## Errors

`src/lib/errors.ts` turns each failure into one shape: `{ error, fieldErrors }`.

- a Zod failure becomes a 400 with per-field messages the form can display;
- a `PostingError` becomes a 409 — the domain layer's own refusal, e.g.
  posting into a closed period or over-allocating an invoice;
- a MongoDB duplicate-key error (11000) or document-validator rejection (121)
  becomes a 409 with a message written for a person, not the driver's own
  wording;
- anything else is a 500 with a generic message, logged in full server-side.

## Tests

```bash
npm test
```

They run against a real MongoDB replica set — `mongodb-memory-server` downloads
a real `mongod` the first time (cached after that) and starts a single-node
replica set, the only server topology that supports the transactions this
application relies on — and then try to break the invariants: unbalanced
entries, over-allocated invoices, concurrent numbering, concurrent payments
racing to settle the same invoice. A mock would pass those tests without
proving anything.

One thing worth reading before you assume more is database-enforced than
actually is: `test/ledger.test.ts` includes a test that deliberately bypasses
`domain/posting.ts` and edits a posted document directly, to make explicit
that MongoDB — unlike the Postgres version this was ported from — cannot stop
that write on its own. See the comment on `postInvoice` in
`src/domain/posting.ts` for the full explanation of what moved from
database-enforced to application-enforced, and why.

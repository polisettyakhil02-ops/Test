# Billing & Invoicing

Internal single-tenant billing system built on a **double-entry general ledger**.
Invoices, credit notes and payments are documents that post balanced journal
entries; every report is derived from those entries rather than from the
documents themselves.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui ·
PostgreSQL + Drizzle · Auth.js v5.

## Setup

```bash
npm install

cp .env.example .env.local
npx auth secret              # writes AUTH_SECRET
# set DATABASE_URL to your PostgreSQL instance

npm run setup -- --email you@company.com --password "your-password" \
                 --company "Acme Pvt Ltd" --state 29

npm run dev
```

`npm run setup` applies the migrations and ledger guards, then creates the
entity, an eight-account chart of accounts, twelve monthly periods, the number
series and your admin user. It is safe to re-run.

There is no public sign-up.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run setup` | Migrations, seed data and the admin user |
| `npm test` | Ledger integration tests against real PostgreSQL |
| `npm run dev:db` | A local PostgreSQL on :5432, backed by PGlite (no install needed) |
| `npm run db:generate` | Regenerate migrations after a schema change |
| `npm run lint` | ESLint |

## The ledger is the source of truth

A document is a request to change the books; the ledger is the record of what
happened. Posting is a one-way door:

```
draft ──post──▶ posted ──void──▶ voided
  │                │
  └─ editable      └─ immutable; corrected with a credit note
```

Posting takes a number, checks the period is open, writes a balanced journal
entry, records an audit row and queues an outbound event — **all in one
transaction**. If any part fails, none of it happened; in particular the invoice
number is returned rather than burned, because a gap in an invoice sequence is
something a tax authority expects you to explain.

An invoice posts `Dr Accounts Receivable / Cr Sales / Cr GST Output`. A payment
posts `Dr Bank / Cr Accounts Receivable`. A credit note posts the reverse of the
invoice, which is why raising one reduces revenue with no special case anywhere.

A customer's balance is not a column: it is the sum of their AR journal lines,
so it cannot disagree with the books.

## Invariants live in the database

These are enforced by PostgreSQL, not by application code, so no future code
path — or `psql` session — can bypass them. See `src/db/ledger-guards.sql`.

| Rule | Mechanism |
|---|---|
| Debits equal credits | `DEFERRABLE INITIALLY DEFERRED` constraint trigger, checked at COMMIT |
| The ledger is append-only | Triggers refusing `UPDATE`/`DELETE` on journal tables |
| Posted documents are frozen | Trigger allowing only the void stamp through |
| An invoice cannot be over-allocated | Deferred trigger comparing allocations to the total |
| A line is a debit or a credit, never both | `CHECK` constraint |

Balance is deferred deliberately: lines are inserted one at a time, so an entry
is legitimately unbalanced mid-transaction. COMMIT is the only moment the rule
is meaningful.

## Money

Every amount is a `bigint` of **minor units** (paise). There are no floats and
no `round2()` helper — the problem is designed out rather than patched at each
boundary. `src/domain/money.ts` holds the integer arithmetic, including
largest-remainder apportionment so a split discount always sums back exactly.

## GST

`src/domain/pricing.ts` resolves the supply kind from the seller's and buyer's
state codes, then splits tax into the components an invoice legally has to show:
**CGST + SGST** at half the rate each within a state, a single **IGST** at the
full rate across states. The two halves are computed so they reconstitute the
total to the paisa.

Tax is charged on the **post-discount** amount. Charging it on the pre-discount
value overstates GST on every discounted invoice.

## Testing

`npm test` runs the ledger against **real PostgreSQL 18**, in-process via
PGlite (WASM) — not a mock, not SQLite. The constraints and triggers under test
are the ones production gets, which is why these three cases are testable at
all:

- a rolled-back posting does not consume an invoice number
- eight concurrent postings never issue the same number
- a posting refused by a closed period writes nothing whatsoever

### Running the app without installing PostgreSQL

```bash
npm run dev:db     # PostgreSQL on 127.0.0.1:5432, data in .devdb/
npm run setup -- --email you@company.com --password "your-password"
npm run dev
```

`dev:db` serves PGlite over the real Postgres wire protocol, so the app
connects exactly as it would to a production instance. One constraint: PGlite
is a single WASM instance and serves one connection at a time, so set
`DATABASE_POOL_MAX=1` when pointing at it. A real PostgreSQL has no such
limit — that is a property of the harness, not the app.

`test/e2e-flow.js` drives the whole business flow through a browser against
that server: sign in, create a client and item, draft an invoice from the item
master, post it, check the trial balance balances, take a partial payment,
raise and post a credit note, and download the PDF.

## Reports

Trial balance, ageing, party balance and P&L all read the journal, so two
reports cannot disagree. The trial balance page states plainly whether the
books balance; if it ever says they do not, the ledger is corrupt.

## Roles

`admin` > `accountant` > `viewer`. Server Actions are public HTTP endpoints, so
every write calls `requireRole()` — rendering inside a protected layout does not
protect the action itself. Voiding a posted document is admin-only.

## A note on `proxy.ts`

In Next.js 16 the `middleware` convention was **renamed to `proxy`**. This file
is the direct equivalent. Tutorials for Next 15 and earlier will tell you to
create `middleware.ts`; that name is deprecated here.

## Not built yet

e-invoicing (IRN/QR) and GSTR-1 export · webhook delivery (outbox rows are
written but nothing drains them) · customer statements · email delivery ·
multi-currency · purchase side (bills, AP) · bank reconciliation · recurring
invoices · approval workflows · custom fields · pagination beyond 200 rows.

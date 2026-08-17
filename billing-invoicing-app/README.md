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

# Your own GSTIN and address -- needed for a compliant invoice and for e-invoicing.
npm run entity -- --gstin 29AABCU9603R1ZX \
                  --legal-name "Acme Private Limited" \
                  --address "4th Floor, 22 MG Road" --address "Bengaluru - 560001"

npm run dev
```

`npm run setup` applies any migrations this database has not seen, re-applies
the ledger guards, then creates the entity, an eight-account chart of accounts,
twelve monthly periods, the number series and your admin user. It records what
it has applied in `applied_migrations`, so it is safe to re-run.

`npm run entity` with no flags prints what is currently set, including whether
you still need a GSTIN or a PIN code.

There is no public sign-up.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run setup` | Migrations, seed data and the admin user |
| `npm run entity` | Show or set your own GSTIN, address and bank details |
| `npm run demo` | Fill an empty database with a realistic dataset to look around |
| `npm run migrate` | Apply pending migrations and the ledger guards |
| `npm run outbox` | Deliver queued events (`-- --once` for cron) |
| `npm test` | Domain and ledger tests against real PostgreSQL |
| `npm run dev:db` | A local PostgreSQL on :5432, backed by PGlite (no install needed) |
| `npm run db:generate` | Regenerate migrations after a schema change |
| `npm run build:scripts` | Bundle the deploy scripts for the container image |
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

### GSTR-1

`/dashboard/reports/gstr1` splits a period's posted documents into the sections
the return is actually filed in, and exports them as CSV. Which section a
document belongs to is decided by the buyer, not by you:

| Section | What lands there |
|---|---|
| **B2B** | Buyer has a GSTIN. Reported invoice by invoice. |
| **B2CL** | Unregistered, inter-state, **above** ₹2,50,000. |
| **B2CS** | Everything else to unregistered buyers, summarised per place of supply and rate. |
| **CDNR** | Credit notes to registered buyers, against the invoice each corrects. |
| **HSN** | A summary by HSN/SAC across the whole return. |

Credit notes to unregistered buyers are netted off inside B2CS rather than
reported separately, and a credit note's values carry a negative sign
everywhere else. Getting this split wrong is one of the most common reasons a
small business's return fails validation, so the rule lives in one function and
is tested on its own.

### e-Invoicing (IRN and QR)

A registered B2B invoice is not a valid tax invoice until an Invoice
Registration Portal has issued it an IRN, and the printed copy has to carry the
signed QR the portal returns.

The document page builds the NIC 1.1 payload and tells you plainly whether the
invoice can be registered — missing GSTIN, missing PIN code, lines without an
HSN code. You download the payload, register it through whichever portal you
use, and paste back the IRN, acknowledgement and signed QR string; the QR is
then rendered onto the PDF.

**It deliberately does not call an IRP.** That needs a GSP contract and
credentials this business does not have, and a half-configured HTTP client that
fails at filing time is worse than an explicit hand-off. When credentials
exist, the download becomes a POST and nothing else changes.

The IRN is **write-once**, enforced by the database: a posted document accepts
the e-invoice stamp and nothing else, and only when it has no IRN already.

## Statements

`/dashboard/clients/<id>/statement` is the customer's receivable account read
straight off the ledger — opening balance, movements, closing balance, with a
CSV to send them. Building it from documents would let it disagree with the
trial balance the moment something is voided; building it from AR journal lines
means it cannot.

## Outbound events

Posting queues an event in `outbox`, inside the same transaction as the ledger
entry. `npm run outbox` drains it:

- signed `X-Billing-Signature: t=<unix>,v1=<hmac-sha256 of "<t>.<body>">`, with
  the timestamp **inside** the signed string so a captured request cannot be
  replayed later
- exponential backoff, 1 minute doubling to an hour, then dead-lettered after
  eight attempts
- claimed with `FOR UPDATE SKIP LOCKED`, so several workers share the queue
  rather than double-delivering
- **at-least-once**: the receiver must dedupe on `X-Billing-Delivery`

`/dashboard/outbox` shows what is pending, delivered or given up on, and lets an
admin retry or drain on demand. With no endpoint configured, events simply
queue — nothing is lost.

## Testing

`npm test` runs against **real PostgreSQL 18**, in-process via PGlite (WASM) —
not a mock, not SQLite. The constraints and triggers under test are the ones
production gets, which is why these cases are testable at all:

- a rolled-back posting does not consume an invoice number
- eight concurrent postings never issue the same number
- a posting refused by a closed period writes nothing whatsoever
- the e-invoice stamp is the one edit a posted document accepts, and nothing
  else may ride along with it

The domain modules are tested as plain functions where they are plain functions:
GSTR-1 sectioning, the IRP payload, signature verification (against an
independent verifier rather than against itself), backoff, and statements
reconciled against the ledger balance they must agree with.

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

Three browser flows drive the app against that server, with
`NODE_PATH` pointing at a Playwright install:

| Flow | Covers |
|---|---|
| `test/e2e-flow.js` | Sign in, client, item, draft from the item master, post, trial balance, partial payment, credit note, PDF |
| `test/e2e-einvoice.js` | Registered inter-state buyer, IGST, IRP payload shape, rejecting a malformed IRN, stamping a real one, IRN and QR on the printed PDF, B2B on the return |
| `test/e2e-outstanding.js` | Statements and their CSV, GSTR-1 and its CSV, e-invoice blockers, the outbox screen, pagination |

`e2e-einvoice.js` needs the entity to have a GSTIN and a PIN-coded address —
run `npm run entity` first.

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

## Deploying it

There is no separate front end and back end. This is one Next.js application —
pages, the Server Actions that write to the database, and the PDF and CSV route
handlers all run in the same process — so you deploy one thing, with PostgreSQL
alongside it.

```bash
cp .env.example .env      # POSTGRES_PASSWORD, AUTH_SECRET, AUTH_URL
docker compose up -d --build
docker compose run --rm app node dist-scripts/setup.cjs --email you@yourco.com --password "..."
```

That brings up PostgreSQL and the app on `127.0.0.1:3000`, runs migrations on
every boot, and leaves TLS to a reverse proxy in front. `GET /api/health`
returns 200 only when the app can actually reach the database.

**[DEPLOY.md](DEPLOY.md)** has the whole thing: Caddy and nginx configs, TLS,
backups, updates, running without Docker, managed platforms, and a checklist to
work through before you invoice a real customer.

## Not built yet

Email delivery · multi-currency · the purchase side (bills, AP) · bank
reconciliation · recurring invoices · approval workflows · custom fields · a UI
for the chart of accounts and period close · GSTR-3B · IRP cancellation within
the 24-hour window.

Two deliberate hand-offs rather than gaps: e-invoicing stops at the payload
because calling an IRP needs a GSP contract, and outbound events stop at a
signed HTTP POST because what consumes them is not this application's business.

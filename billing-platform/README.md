# Billing &amp; Invoicing

GST billing for a single Indian business, built as separate deployables: a
MongoDB database, an Express API, and a React browser app.

Every figure the app shows is derived from a double-entry ledger. There is no
"total" field anywhere that could disagree with the books — the dashboard, the
ageing report, a customer's statement and the trial balance are four different
aggregations over the same journal lines, and they cannot drift apart because
there is nothing to drift.

```
browser  ──HTTPS──▶  frontend        (nginx serving a static bundle)
                        │
                        │  /api  (same origin, proxied)
                        ▼
                     backend         (Express, the ledger, PDF and CSV export)
                        │
                        │  mongodb+srv://
                        ▼
                     MongoDB Atlas   (managed replica set)
```

The front end and the API are each independently buildable and deployable —
they talk over HTTP and a connection string, nothing else — so you can run
both with Compose on one box, or put the front end on GitHub Pages and the API
on a container host, without changing a line of code. The database is not a
service this repo runs for you: Atlas is a managed replica set, which this
application's transactions require, and standing up your own replica set is
more operational surface than a solo developer setting up billing software
needs to take on. `DEPLOY.md` covers self-hosting MongoDB anyway, for anyone
who wants to.

---

## Quick start

### With Docker

```bash
cp .env.example .env
# Fill in MONGODB_URI (your Atlas connection string) and JWT_SECRET. For the
# second:
#   openssl rand -base64 48

docker compose up -d --build

# Create your business and the first admin user.
docker compose run --rm backend node dist/scripts/setup.js \
  --email you@yourbusiness.com \
  --password 'a-real-password' \
  --company 'Your Business Pvt Ltd' \
  --state 29
```

Open <http://localhost:8080> and sign in.

The `--state` flag is your GST state code (29 is Karnataka, 27 Maharashtra,
07 Delhi — the full list is in `frontend/src/lib/format.ts`). It decides
whether a given invoice is CGST + SGST or IGST, so it is worth getting right.

### Without Docker

Three terminals. You need Node 22 and a MongoDB replica set you can reach — a
single `mongod` will not do, because this application posts every document
inside a multi-document transaction, and MongoDB refuses transactions outright
on a standalone server.

```bash
# 1. Database — an Atlas free tier cluster works, or if you have neither Atlas
#    nor a local replica set to hand, the backend can run a real one:
cd backend && npm install && npm run dev:db
# prints MONGODB_URI=mongodb://127.0.0.1:27017/billing?replicaSet=rs0

# 2. API
cd backend
cp .env.example .env          # set MONGODB_URI and JWT_SECRET
npm run setup -- --email you@yourbusiness.com --password 'a-real-password' \
                 --company 'Your Business Pvt Ltd' --state 29
npm run dev                   # :4000

# 3. Browser app
cd frontend && npm install && npm run dev    # :5173
```

Vite proxies `/api` to `:4000` in development, so the browser stays on one
origin and cookies behave exactly as they will in production.

Want something to look at? `npm run demo` in `backend/` seeds six clients,
eight items and fifteen documents, including two drafts and a credit note.

---

## What it does

**Masters** — clients with GSTIN and place of supply, items with HSN/SAC codes,
default rates and units. Search and pagination on both.

**Documents** — tax invoices, credit notes and payments. A document is a draft
until you post it; posting assigns a gapless number from a per-financial-year
series and writes the journal entry, both inside one transaction. Posted
documents are immutable: a correction is a credit note, and a mistake is a void,
which writes a reversing entry rather than deleting anything.

**Tax** — CGST + SGST for a supply within your state, IGST for one outside it,
decided from the place of supply on each document. Line-level rates, document
level discounts apportioned across lines by largest remainder so the parts
always sum to the whole.

**Payments** — record a receipt and apply it across open invoices, or let it
settle them oldest first. Partial payments are normal, and what remains open is
computed rather than stored.

**Reports** — dashboard, ageing by bucket, per-client statement of account,
trial balance, and GSTR-1 with B2B, B2CL, B2CS, CDNR and HSN sections, exportable
as CSV.

**e-Invoicing** — for invoices over the threshold, the app builds the NIC 1.1
payload, tells you exactly which fields are missing if any are, and records the
IRN, acknowledgement and signed QR you get back. The QR then prints on the PDF,
which it must for the printed copy to be a valid tax invoice.

**Webhooks** — posting or voiding a document queues an event in a transactional
outbox, in the same transaction as the document itself, so nothing is ever
announced for a document that failed to save. A worker delivers them with an
HMAC-SHA256 signature and exponential backoff.

**PDF** — invoices render server-side with `@react-pdf/renderer`.

---

## Layout

```
backend/    Express API, the ledger, reports, PDF and CSV export, CLI scripts.
frontend/   React SPA. Vite build, nginx image, no server-side rendering.
```

Each directory has its own `package.json`, its own `Dockerfile` and its own
README where there is more to say. `docker-compose.yml` at the root wires them
together; the database is Atlas, reached over a connection string rather than
run as a service here.

---

## Where the rules are enforced

Mostly still in the database, though the honest answer changed shape when the
database did. MongoDB has document validators and unique indexes, but nothing
like a Postgres `BEFORE UPDATE` trigger that can compare a write against the
row it replaces — a validator only ever sees the document being written, never
the one before it. So:

- **A journal entry's lines always balance.** Each entry embeds its own lines
  as an array, and a MongoDB document validator checks that
  `sum(debits) == sum(credits)` on that one document at insert time — still
  database-enforced, still holds for a write that skips the application
  entirely, just expressed as one document's own arithmetic instead of a
  cross-table trigger.
- **An invoice can never be allocated for more than it is worth**, even under
  two concurrent payments racing to settle it. `documents.allocatedMinor` is a
  running total kept on the invoice itself specifically so this, too, can be a
  validator (`allocatedMinor <= totalMinor`) rather than a check that would
  need to look outside the document being written.
- **Posted documents and journal entries are meant to be append-only** — but
  this is the one guarantee that moved from "the database refuses it" to "the
  application refuses it, and only application code ever writes here."
  Nothing in MongoDB can reject an update for being disallowed based on the
  document's *previous* state, so this now lives entirely in
  `backend/src/domain/posting.ts`, the single code path every route goes
  through. `backend/test/ledger.test.ts` tests the boundary of that
  protection explicitly — including a test that shows a raw driver write
  *can* bypass it — rather than assuming the guarantee still holds unchanged.
- **Document numbers are gapless.** MongoDB has no row lock, so the Postgres
  version's `SELECT … FOR UPDATE` becomes an atomic `findOneAndUpdate`
  increment inside the posting transaction; a concurrent conflict aborts and
  retries the whole posting rather than blocking on a lock.
- **Money is an integer number of paise throughout.** No floats, anywhere, at
  any layer. The browser receives integers and only ever formats them for
  display.

The test suite runs against a real MongoDB replica set — `mongodb-memory-server`
downloads a real `mongod` and runs it in-process, the same shape of thing
PGlite did for Postgres — not a mock, so the validators above are the ones
under test.

```bash
cd backend && npm test        # 92 tests
```

---

## Deployment

`DEPLOY.md` has the details. In short:

| Where | How |
| --- | --- |
| API + front end on one box | `docker compose up -d --build`, `MONGODB_URI` pointed at Atlas |
| Front end on GitHub Pages | The included workflow builds and deploys it; point `API_URL` at your API |
| Front end on Netlify / Vercel / Cloudflare Pages | Build `frontend/` with `VITE_API_URL` set |
| API on Fly / Railway / Render / any container host | Build `backend/Dockerfile`, set `MONGODB_URI` and `JWT_SECRET` |
| Database | MongoDB Atlas (a free M0 cluster is enough to start); self-hosting is covered in `DEPLOY.md` |

The one thing worth reading before you split the front end and the API across
different *sites*: the session is an httpOnly cookie, so you need
`COOKIE_CROSS_SITE=true`, HTTPS on both, and the front end's exact origin in
`CORS_ORIGINS`. `DEPLOY.md` explains why, and what breaks if you get it wrong.

---

## Security posture

Deliberate choices, so you can judge them rather than discover them:

- **Sessions** are JWTs in an httpOnly, SameSite cookie. The browser cannot
  read the token, so an XSS bug cannot exfiltrate it. Rotating `JWT_SECRET`
  invalidates every session at once.
- **Roles** are `admin`, `accountant` and `viewer`, checked server-side on every
  write. The role is re-read from the database on each request rather than
  trusted from the token, so revoking access takes effect immediately.
- **Login** compares against a dummy hash when the account does not exist, so
  the response time does not reveal which emails are registered.
- **CORS** is an exact-match allowlist. Never `*` — it cannot be combined with
  credentials, and the browser would refuse to send the cookie anyway.
- **There is no sign-up.** Accounts are created from the command line. This is
  a single-business system; a public registration form would be a liability.

---

## Licence

Private, for internal use.

# Billing &amp; Invoicing

GST billing for a single Indian business, built as three separate deployables:
a PostgreSQL database, an Express API, and a React browser app.

Every figure the app shows is derived from a double-entry ledger. There is no
"total" column anywhere that could disagree with the books — the dashboard, the
ageing report, a customer's statement and the trial balance are four different
queries over the same journal lines, and they cannot drift apart because there
is nothing to drift.

```
browser  ──HTTPS──▶  frontend        (nginx serving a static bundle)
                        │
                        │  /api  (same origin, proxied)
                        ▼
                     backend         (Express, the ledger, PDF and CSV export)
                        │
                        │  postgres://
                        ▼
                     db              (PostgreSQL 17)
```

Each of the three directories is independently buildable and deployable. They
talk over HTTP and a connection string, nothing else — so you can run all three
with Compose on one box, or put the front end on GitHub Pages, the API on a
container host and the database on a managed service, without changing a line
of code.

---

## Quick start

### With Docker

```bash
cp .env.example .env
# Fill in POSTGRES_PASSWORD and JWT_SECRET. For the second:
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

Three terminals. You need Node 22 and a PostgreSQL 13 or newer you can reach.

```bash
# 1. Database — anything you like. If you have none to hand, the backend can
#    run a real PostgreSQL server in-process:
cd backend && npm install && npm run dev:db

# 2. API
cd backend
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
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
db/         PostgreSQL service. The schema lives in the backend's migrations.
backend/    Express API, the ledger, reports, PDF and CSV export, CLI scripts.
frontend/   React SPA. Vite build, nginx image, no server-side rendering.
```

Each directory has its own `package.json`, its own `Dockerfile` and its own
README where there is more to say. `docker-compose.yml` at the root wires the
three together.

---

## Where the rules are enforced

Not only in the application. The database refuses to hold a broken ledger:

- a deferred constraint trigger checks that every journal entry balances at
  commit time, so an unbalanced entry cannot be written by any client;
- triggers refuse UPDATE and DELETE on posted documents and journal lines,
  with one exception — the e-invoice stamp is write-once on an otherwise
  unchanged row;
- document numbers are allocated under `SELECT … FOR UPDATE`, so two concurrent
  posts serialise instead of racing for the same number;
- money is `bigint` paise throughout. No floats, anywhere, at any layer. The
  browser receives integers and only ever formats them for display.

The test suite runs against real PostgreSQL in-process (PGlite), not a mock, so
those triggers are the ones under test.

```bash
cd backend && npm test        # 88 tests
```

---

## Deployment

`DEPLOY.md` has the details. In short:

| Where | How |
| --- | --- |
| One box, all three services | `docker compose up -d --build` |
| Front end on GitHub Pages | The included workflow builds and deploys it; point `API_URL` at your API |
| Front end on Netlify / Vercel / Cloudflare Pages | Build `frontend/` with `VITE_API_URL` set |
| API on Fly / Railway / Render / any container host | Build `backend/Dockerfile`, set `DATABASE_URL` and `JWT_SECRET` |
| Database on Neon / Supabase / RDS | Point `DATABASE_URL` at it and run `npm run migrate` |

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

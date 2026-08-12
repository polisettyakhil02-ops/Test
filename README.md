# Ask the ERP

A natural-language search and action assistant for a school ERP. Type a request in
plain English — a search, a payment, a status change, a concession or cancellation
request, a support ticket, a bus route change, or a report — and it parses the
sentence, resolves it against real records (asking you to disambiguate when it's
not sure), shows you exactly what it's about to do, and only then executes it.

This is a **real, working reference implementation**: an Express API backed by a
JSON-persisted in-memory store, and a static frontend that talks to it — one
process, nothing else to stand up. The full design (architecture, the fuzzy
nearest-match matching algorithm, API contract, permission model, test plan) is
written up in [`docs/Ask_the_ERP_Developer_Spec.pdf`](docs/Ask_the_ERP_Developer_Spec.pdf);
this README is the "how do I run/deploy it" companion to that document.

## Quickstart

```bash
npm install
npm start
```

Open http://localhost:3000. That's it — no database to provision, no build step.
State is seeded from `src/data/seed.js` on first boot and persisted to
`data/store.json` after that (see [Persistence](#persistence-model) below).

```bash
npm test    # 37 tests: fuzzy matcher, intent parser, full API flows
npm run dev # auto-restart on file changes (node --watch)
```

## How it works

Three-endpoint contract, matching the spec's Tier 1 / Tier 2 split:

| Endpoint | Does |
|---|---|
| `POST /api/ask/interpret` | Parses the query into a structured intent. No DB access, no side effects. |
| `POST /api/ask/resolve` | Runs a search, or resolves a write-action's target against real records — returns candidates for you to disambiguate, or a single resolved match. Still no side effects. |
| `POST /api/ask/confirm` | Executes. Only ever called after `/resolve` returned exactly one candidate and the user explicitly confirmed. |

Three actions execute immediately on confirm (`record_payment`,
`change_transport_route`, `create_support_ticket`). Three others
(`update_status`, `request_concession_change`, `request_receipt_cancellation`)
only ever create a row in `pendingApprovals` here — nothing changes until
someone acts on it:

| Endpoint | Does |
|---|---|
| `GET /api/approvals?role=admin_officer\|principal&branch=...` | Lists pending approvals, scoped to a role/branch. |
| `POST /api/approvals/:id/decision` | `{ decision: "approve" \| "reject" }` — approving actually applies the deferred change (unlocks the concession, cancels the receipt, updates the status). |

Entity resolution (matching "Ravi Kumr" to the real student "Ravi Kumar", or
"Kukatpaly" to the branch "Kukatpally") goes through fuzzy edit-distance
matching in `src/lib/fuzzy.js` — see the spec's section 3 for why plain
Levenshtein isn't the right choice here and what the distance-budget
calibration is protecting against.

```
src/
  lib/
    fuzzy.js     Tier 2 matching primitives (edit distance, tokenizer, nearest-match)
    intent.js    Tier 1 parser: query -> structured intent
    resolve.js   candidate resolution/disambiguation + read-only search
    actions.js   confirm-time executors (the only code that mutates the store)
    store.js     in-memory state + JSON-file persistence + audit log
    rateLimit.js minimal per-IP rate limiter
  routes/        Express routers (ask.js, approvals.js)
  data/seed.js   starting fixture data
public/          the frontend (single static HTML file, no build step)
test/            37 tests: unit (fuzzy, intent, rate limiter) + full API integration
docs/            the full developer spec this was built from
```

## Persistence model

There's no database here — `src/lib/store.js` holds state in memory and writes
it to `data/store.json` after every mutation, loading it back on boot if
present. That's enough to survive a process restart on a single small
deployment, and it's an intentional, documented simplification, not an
oversight (see the spec, section 1.1).

**Moving to a real database:** everything that touches state goes through
`store.js`'s exported accessors (`store.students`, `store.receipts`, ...) and
two calls (`store.save()`, `store.appendAudit()`). Swap the module's internals
for real queries against Postgres/MySQL/whatever and nothing in `resolve.js`,
`actions.js`, or the routes needs to change — they don't know or care that it's
a flat file today.

## Wiring up real integrations

- **Support tickets** (`create_support_ticket` in `src/lib/actions.js`) currently
  just persists the ticket and `console.log`s it. Replace that log line with a
  call to your real helpdesk/email system.
- **Auth / roles**: there is no login system. `GET /api/approvals` takes `role`
  and `branch` as query params rather than reading them from a session — wire
  that up to your real auth before this is usable by more than one trusted
  team. Every write endpoint should also check the caller is allowed to act on
  the branch/student in question; that check isn't implemented yet.

## Hosting

This is one Node process serving both the API and the static frontend, so any
platform that runs `npm install && npm start` works:

- **Render / Railway / Fly.io** — point them at this repo, build command
  `npm install`, start command `npm start`. Add a persistent disk/volume and
  set `DATA_DIR` to a path on it, or state resets on every redeploy.
- **A plain VPS** — `git clone`, `npm install`, run `npm start` under `pm2` or
  a `systemd` unit, put Nginx in front of it for TLS.
- **Docker** — there's no Dockerfile checked in yet; a Node 20-slim base image
  running `npm ci --omit=dev` then `npm start`, with `data/` mounted as a
  volume, is all this needs.

Set `TRUST_PROXY=1` (see `.env.example`) on any platform that sits behind a
load balancer, or the built-in rate limiter will see every request as coming
from the same IP.

## Before exposing this to real users

This is a faithful reference implementation of the spec, not a hardened
production deployment. Before pointing real traffic at it:

- Add real authentication and per-request authorization (see above).
- Move off the JSON-file store once more than one process needs to see the
  same state, or once the student count makes fuzzy matching over every
  request noticeably slow (see the spec, section 10.1).
- Put the whole thing behind HTTPS (a platform's built-in TLS, or Nginx/Caddy
  in front of it).
- Review `docs/Ask_the_ERP_Developer_Spec.pdf` section 10 (Non-Functional
  Requirements) for the full checklist this was written against.

# Ask the ERP — Backend

The API: query parsing (Tier 1), fuzzy entity resolution and disambiguation
(Tier 2), and the confirm-time actions that actually mutate state. See the
[repo root README](../README.md) for how this fits together with the
frontend, and [`docs/Ask_the_ERP_Developer_Spec.pdf`](../docs/Ask_the_ERP_Developer_Spec.pdf)
for the full design.

## Run it

```bash
npm install
npm start        # listens on PORT (default 3000)
```

```bash
npm test          # 37 tests
npm run dev        # auto-restart on file changes
```

Copy `.env.example` to `.env` and adjust if you need a non-default port, a
custom `DATA_DIR`, `TRUST_PROXY`, or to restrict `CORS_ORIGIN` to your actual
frontend's URL (defaults to `*`, fine for local dev, not for production - see
"Before exposing this to real users" in the root README).

## API

| Endpoint | Does |
|---|---|
| `POST /api/ask/interpret` | `{ query }` → parses into a structured intent. No DB access, no side effects. |
| `POST /api/ask/resolve` | Runs a search, or resolves a write-action's target against real records. Returns disambiguation candidates or a single resolved match. Still read-only. |
| `POST /api/ask/confirm` | Executes. Only call this after `/resolve` returned exactly one candidate and the user confirmed. |
| `GET /api/approvals?role=&branch=` | Lists pending approvals, scoped to a role/branch. |
| `POST /api/approvals/:id/decision` | `{ decision: "approve" \| "reject" }` — approving applies the deferred change. |
| `GET /api/health` | Liveness check. |

## Structure

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
  server.js      Express app (exported, not started - see index.js)
  index.js       entrypoint: creates the app and listens
test/            unit tests (fuzzy, intent, rate limiter) + full API integration tests
data/            runtime state lives here (store.json, audit.log) - gitignored
```

## Persistence

No database - `src/lib/store.js` holds state in memory and writes it to
`data/store.json` after every mutation, loading it back on boot if present.
Enough to survive a restart on a single small deployment; not a substitute
for a real database once you need more than one process to see the same
state. See the spec's section 1.1 for why this is a deliberate
simplification, and the root README's "Moving to a real database" note for
what changes.

## CORS

The frontend now runs on a different origin (different host, different port,
or both) from this API, so CORS is real here, not optional. Set
`CORS_ORIGIN` to your frontend's exact URL before deploying either of them
somewhere a stranger could hit this API from a browser.

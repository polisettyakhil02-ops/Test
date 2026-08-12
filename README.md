# Ask the ERP

A natural-language search and action assistant for a school ERP. Type a request in
plain English — a search, a payment, a status change, a concession or cancellation
request, a support ticket, a bus route change, or a report — and it parses the
sentence, resolves it against real records (asking you to disambiguate when it's
not sure), shows you exactly what it's about to do, and only then executes it.

This is a **real, working reference implementation**, split into two independently
runnable and deployable pieces:

```
backend/    Express API - query parsing, fuzzy entity resolution, confirm-time actions
frontend/   Static HTML/JS - no build step, talks to the backend over fetch()
docs/       Ask_the_ERP_Developer_Spec.pdf - the full design this was built from
```

Each has its own README with run/deploy instructions:
[`backend/README.md`](backend/README.md) ·
[`frontend/README.md`](frontend/README.md)

## Quickstart

Two terminals:

```bash
# Terminal 1
cd backend && npm install && npm start      # http://localhost:3000

# Terminal 2
cd frontend && npm start                    # http://localhost:5173
```

Open http://localhost:5173. The frontend's `config.js` already points at
`http://localhost:3000` by default, matching this two-terminal setup — see
`frontend/README.md` to point it at a different backend. The backend's
`CORS_ORIGIN` defaults to allowing any origin, which is fine for local dev —
tighten it before deploying either piece publicly (see below).

```bash
cd backend && npm test    # 51 tests: fuzzy matcher, intent parser, LLM mapping, full API flows
```

## How it works

Three-endpoint contract on the backend, matching the spec's Tier 1 / Tier 2 split:

| Endpoint | Does |
|---|---|
| `POST /api/ask/interpret` | Parses the query into a structured intent. No DB access, no side effects. |
| `POST /api/ask/resolve` | Runs a search, or resolves a write-action's target against real records — returns candidates for you to disambiguate, or a single resolved match. Still no side effects. |
| `POST /api/ask/confirm` | Executes. Only ever called after `/resolve` returned exactly one candidate and the user explicitly confirmed. |

Three actions execute immediately on confirm (`record_payment`,
`change_transport_route`, `create_support_ticket`). Three others
(`update_status`, `request_concession_change`, `request_receipt_cancellation`)
only ever create a pending approval — nothing changes until someone acts on it
via `GET /api/approvals` / `POST /api/approvals/:id/decision`.

Entity resolution (matching "Ravi Kumr" to the real student "Ravi Kumar", or
"Kukatpaly" to the branch "Kukatpally") goes through fuzzy edit-distance
matching in `backend/src/lib/fuzzy.js` — see the spec's section 3 for why
plain Levenshtein isn't the right choice here and what the distance-budget
calibration is protecting against.

Query parsing itself (deciding *which* of the 9 actions a sentence means) is
pluggable: a free rule-based parser by default, or a real LLM call (Claude)
if you set `INTENT_ENGINE=llm` and `ANTHROPIC_API_KEY` — see
`backend/README.md` "LLM-backed parsing". Either way, entity resolution
against real records goes through the same fuzzy matcher above, so
disambiguation and confirmation behave identically regardless of which
engine parsed the sentence.

## Deploying backend and frontend separately

That's the point of the split - two unrelated hosts is a completely normal
setup:

1. Deploy `backend/` somewhere that runs `npm install && npm start` (Render,
   Railway, Fly.io, a VPS, ...). Set `CORS_ORIGIN` on it to your frontend's
   URL once you know it.
2. Deploy `frontend/` to any static host (GitHub Pages, Netlify, Vercel,
   Cloudflare Pages, S3, ...). Edit `frontend/config.js` to point
   `ASK_ERP_API_BASE` at step 1's URL before uploading.

Full details, including a persistent-disk note for the backend's JSON store,
are in each folder's README.

## Before exposing this to real users

This is a faithful reference implementation of the spec, not a hardened
production deployment. Before pointing real traffic at it:

- Add real authentication and per-request authorization — there is none yet.
  `GET /api/approvals` takes `role`/`branch` as query params rather than
  reading them from a session; every write endpoint should also check the
  caller is allowed to act on the branch/student in question.
- Restrict `CORS_ORIGIN` on the backend to your actual frontend's URL instead
  of the local-dev default of allowing any origin.
- Move off the JSON-file store once more than one backend process needs to
  see the same state, or once the student count makes fuzzy matching over
  every request noticeably slow (spec section 10.1). See `backend/README.md`
  "Moving to a real database".
- Put both behind HTTPS (a platform's built-in TLS, or Nginx/Caddy in front).
- Wire up real integrations where `backend/src/lib/actions.js` currently
  stubs them (support tickets just log to console right now).
- Review `docs/Ask_the_ERP_Developer_Spec.pdf` section 10 (Non-Functional
  Requirements) for the full checklist this was built against.

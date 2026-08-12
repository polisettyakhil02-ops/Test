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
npm test          # 51 tests (3 skipped unless ANTHROPIC_API_KEY is set - see below)
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
    fuzzy.js        Tier 2 matching primitives (edit distance, tokenizer, nearest-match)
    intent.js       Tier 1 parser (rule-based): query -> structured intent
    llmIntent.js    Tier 1 parser (LLM-backed, optional): same job, via Claude
    intentEngine.js picks rule-based vs LLM per INTENT_ENGINE, with fallback
    resolve.js      candidate resolution/disambiguation + read-only search
    actions.js      confirm-time executors (the only code that mutates the store)
    store.js        in-memory state + JSON-file persistence + audit log
    rateLimit.js    minimal per-IP rate limiter
  routes/           Express routers (ask.js, approvals.js)
  data/seed.js      starting fixture data
  server.js         Express app (exported, not started - see index.js)
  index.js          entrypoint: creates the app and listens
test/               unit tests (fuzzy, intent, llmIntent, rate limiter) + full API integration tests
data/               runtime state lives here (store.json, audit.log) - gitignored
```

## LLM-backed parsing (optional)

By default, `POST /api/ask/interpret` uses the rule-based parser in
`src/lib/intent.js` - free, no network call, no API key. Set these to route
it through Claude instead:

```bash
INTENT_ENGINE=llm
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001   # optional, this is the default
```

What changes and what doesn't:

- **Only Tier 1 (action + slot extraction) changes.** The LLM never sees or
  resolves actual student/branch/route names - it extracts them as raw text,
  exactly as typed, and the same fuzzy matcher in `fuzzy.js` resolves that
  raw text against real records either way. Disambiguation, confirmation, and
  every write action work identically regardless of which engine parsed the
  query.
- **`reason` extraction is the one place the LLM is trusted with more
  judgment** than the regex-based parser: it can find a stated reason without
  requiring the literal word "because". The system prompt in `llmIntent.js`
  explicitly instructs it to return `null` rather than invent one - review
  `data/audit.log` periodically if this matters for your use case.
- **Any failure falls back automatically** - missing key, network error,
  8-second timeout, malformed response - `intentEngine.js` catches it, logs
  it, and re-runs the query through the rule-based parser. A user never sees
  an error because the LLM call failed; worst case, accuracy on hard phrasing
  drops back to the rule-based baseline for that one request.

`test/llmIntent.test.js` covers the tool schema and the flat-output-to-intent
mapping without any network call. `test/llmIntent.live.test.js` makes real
API calls and is skipped automatically unless `ANTHROPIC_API_KEY` is set:

```bash
ANTHROPIC_API_KEY=sk-ant-... node --test test/llmIntent.live.test.js
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

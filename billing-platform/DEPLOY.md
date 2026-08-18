# Deployment

Three services, three decisions: where PostgreSQL lives, where the API runs,
and where the static bundle is served from. They are independent — this
document covers the combinations worth having, and the one thing that catches
people out when the front end and the API end up on different sites.

---

## The cookie question, first

The session is a JWT in an **httpOnly cookie**. The browser cannot read it, so
an XSS bug cannot steal it. The cost is that the cookie has to be *sent*, and
whether the browser sends it depends on how you deploy:

| Front end and API are… | Cookie needs | Requires |
| --- | --- | --- |
| the same origin (nginx proxies `/api`) | `SameSite=Lax`, the default | nothing |
| different ports on one host | `SameSite=Lax` | nothing — same site |
| different sites (`app.example.com` and `api.example.com`, or Pages + your API) | `SameSite=None; Secure` | `COOKIE_CROSS_SITE=true`, **HTTPS on both** |

Set `COOKIE_CROSS_SITE=true` only in the last case. Browsers reject
`SameSite=None` without `Secure`, and `Secure` without HTTPS, so a cross-site
deploy over plain HTTP fails at login with no session and no obvious reason —
the request succeeds, the cookie is silently dropped, and the next call is a
401.

In the cross-site case you also need the front end's **exact** origin in
`CORS_ORIGINS`: scheme, host and port, no trailing slash, comma-separated for
more than one. `*` is not an option — the browser refuses to send credentials
to a wildcard origin, which is the whole point of the rule.

If you would rather not think about any of this, put both behind one reverse
proxy. That is what `docker-compose.yml` does, and why it is the default.

---

## Option 1 — one box, Docker Compose

The simplest thing that works, and the one to pick unless you have a reason not
to. nginx serves the bundle and proxies `/api` to the backend, so everything is
one origin.

```bash
cp .env.example .env
# POSTGRES_PASSWORD and JWT_SECRET are required; the rest have defaults.
docker compose up -d --build

docker compose run --rm backend node dist/scripts/setup.js \
  --email you@yourbusiness.com --password 'a-real-password' \
  --company 'Your Business Pvt Ltd' --state 29
```

Migrations run on every backend start. They record what they have applied, so
this is a no-op once the schema is current — and it means the server can never
come up against a schema older than its code.

**Put TLS in front of it.** Compose publishes port 8080 in the clear. Caddy is
two lines:

```
billing.yourbusiness.com {
  reverse_proxy localhost:8080
}
```

or use nginx, or Cloudflare Tunnel. Once you have HTTPS, nothing else changes:
same origin, `SameSite=Lax`, no CORS involved.

**Webhooks.** The worker is off by default. Set `WEBHOOK_ENDPOINT` and
`WEBHOOK_SECRET` in `.env`, then:

```bash
docker compose --profile webhooks up -d
```

**Backups.** All the state is in one database:

```bash
docker compose exec db pg_dump -U billing -d billing --format=custom > billing.dump
```

Restore it somewhere before you need it. See `db/README.md`.

---

## Option 2 — front end on GitHub Pages, API elsewhere

This is the "host it from GitHub" route. Pages serves static files, so it can
host the browser app but not the API or the database — those need somewhere
that can hold a PostgreSQL connection.

**1. Deploy the API and the database first.** Any container host works; see
Option 3. Note its public HTTPS origin, e.g. `https://api.yourbusiness.com`.

**2. On the API**, set:

```
COOKIE_CROSS_SITE=true
CORS_ORIGINS=https://<you>.github.io
```

Use the exact Pages origin. For a project site the origin is still
`https://<you>.github.io` — the `/repo/` part is a path, and origins do not
include paths.

**3. In the repository**, set the variable `API_URL` under
Settings → Secrets and variables → Actions → Variables to your API origin, and
turn on Pages with "GitHub Actions" as the source (Settings → Pages).

**4. Push to `main`.** `.github/workflows/pages.yml` builds `frontend/` and
deploys it. It works out the base path itself, so both a user site
(`<you>.github.io`) and a project site (`<you>.github.io/<repo>/`) come out
right.

Deep links work because the build writes a `404.html` alongside `index.html`.
Pages serves it for any unknown path, the SPA boots, and the router takes the
URL from there. It arrives with a 404 status; the page renders regardless. This
is the standard trick and the only one Pages supports.

The same shape works on Netlify, Vercel or Cloudflare Pages — build
`frontend/` with `VITE_API_URL` set, and add an SPA fallback rewrite
(`/* → /index.html`), which those platforms configure rather than relying on a
404 page.

---

## Option 3 — API on a container host

`backend/Dockerfile` produces a self-contained image. It needs:

| Variable | |
| --- | --- |
| `DATABASE_URL` | required |
| `JWT_SECRET` | required, long and random |
| `CORS_ORIGINS` | required if a browser on another origin calls it |
| `COOKIE_CROSS_SITE` | `true` for a cross-site front end |
| `DATABASE_POOL_MAX` | below your database's connection limit |
| `PORT` | defaults to 4000 |

Run migrations as a release step, or use the same command Compose does:

```
sh -c "node dist/scripts/migrate.js && node dist/index.js"
```

`GET /api/health` queries the database rather than just returning 200, so a
process that is up but cannot reach PostgreSQL is reported unhealthy instead of
being kept in the load balancer. Point your platform's health check at it.

The image runs as a non-root user and writes nothing to disk — no volume
needed.

Platform notes:

- **Fly.io** — `fly launch --dockerfile backend/Dockerfile`, then
  `fly secrets set JWT_SECRET=… DATABASE_URL=…`. Their managed Postgres works;
  so does an external one.
- **Railway / Render** — point at `backend/` as the build context, set the
  variables, use their Postgres add-on for `DATABASE_URL`.
- **A VPS** — `docker compose up -d` from Option 1 is less work than any of
  the above.

---

## Option 4 — managed database

Nothing depends on the `db` container. Point `DATABASE_URL` at any PostgreSQL
13 or newer and run the migrations:

```bash
cd backend
DATABASE_URL='postgres://…?sslmode=require' npm run migrate
```

- **Neon, Supabase, RDS, Cloud SQL** all work. Append `sslmode=require` if the
  connection string does not already have it.
- Set `DATABASE_POOL_MAX` below the plan's connection limit. With a serverless
  pooler in front, keep it small.
- Remove the `db` service from `docker-compose.yml`, or just don't start it.

---

## Upgrading

```bash
git pull
docker compose up -d --build
```

Migrations apply on start. They run one transaction per file, so a failure
leaves the schema at the last complete migration rather than half-applied.

Roll back by deploying the previous image. If the release included a migration
that dropped or renamed something, restore from a backup instead — a schema
change is not automatically reversible, and pretending otherwise is how data
goes missing.

---

## A short checklist before you call it live

- [ ] `JWT_SECRET` is long, random, and not the one from `.env.example`.
- [ ] `POSTGRES_PASSWORD` likewise, and PostgreSQL is not published to the
      internet.
- [ ] HTTPS terminates in front of the app.
- [ ] `CORS_ORIGINS` lists exactly the origins you serve the app from.
- [ ] A backup has been taken **and restored somewhere** at least once.
- [ ] Your entity's GSTIN, state code and address are correct — they print on
      every invoice, and posted invoices keep their own copy, so fixing it
      later does not fix the ones already issued.
- [ ] You have signed in as the admin and posted one test invoice, then voided
      it, and the trial balance still balances.

# Deployment

Two services and a managed database: where the API runs, where the static
bundle is served from, and MongoDB Atlas holding the data. They are
independent — this document covers the combinations worth having, and the one
thing that catches people out when the front end and the API end up on
different sites.

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

## MongoDB Atlas, first — everything else needs it

This application posts every document inside a multi-document transaction, and
MongoDB refuses transactions outright on a standalone server. Atlas clusters
are already replica sets, which is the whole reason to reach for it instead of
a single self-hosted `mongod`: nothing else here works without one.

1. **Create a free cluster.** [cloud.mongodb.com](https://cloud.mongodb.com) →
   Create a project → Build a Database → M0 (free) is enough to run the whole
   app; upgrade later without changing anything but the connection string.
2. **Create a database user.** Database Access → Add New Database User. Give
   it a generated password, not one you also use anywhere else.
3. **Allow your deployment's IP.** Network Access → Add IP Address. For a
   container host with a dynamic IP, `0.0.0.0/0` (allow from anywhere) is the
   pragmatic choice — the database user's password is still the thing standing
   between the internet and your data, so make it a strong, generated one.
4. **Get the connection string.** Cluster → Connect → Drivers → copy the
   `mongodb+srv://` URI, fill in the user's password, and add a database name
   before the `?`:
   ```
   mongodb+srv://billing:REDACTED@cluster0.xxxxx.mongodb.net/billing?retryWrites=true&w=majority
   ```
   That whole string is `MONGODB_URI`.
5. **Ensure the indexes and validators.** Run once against a fresh cluster,
   and safe to re-run on every deploy after:
   ```bash
   cd backend
   MONGODB_URI='mongodb+srv://…' npm run migrate
   ```

There is no schema to migrate in the SQL sense — a MongoDB collection accepts
any document until a validator says otherwise — so `npm run migrate` only
ensures indexes and validators exist. It is genuinely a no-op the second time,
not merely fast: `createIndex` and `collMod` with an identical spec are
idempotent operations, not migrations with a ledger of what already ran.

**Backups.** Atlas takes them for you on any paid tier (M10 and up); the free
M0 tier does not include automated backups, so if you are running real books
on it, either upgrade or export on a schedule yourself:
```bash
mongodump --uri="$MONGODB_URI" --archive=billing-$(date +%F).gz --gzip
```
Restore with `mongorestore --uri="$MONGODB_URI" --archive=billing-2026-08-17.gz --gzip`.
Test the restore before you need it. A backup nobody has restored is a
hypothesis, not a backup.

---

## Option 1 — one box, Docker Compose

The simplest thing that works, and the one to pick unless you have a reason
not to. nginx serves the bundle and proxies `/api` to the backend, so
everything the *browser* talks to is one origin; the backend still reaches out
to Atlas over the internet, same as any other client of a managed database.

```bash
cp .env.example .env
# MONGODB_URI (your Atlas connection string) and JWT_SECRET are required; the
# rest have defaults.
docker compose up -d --build

docker compose run --rm backend node dist/scripts/setup.js \
  --email you@yourbusiness.com --password 'a-real-password' \
  --company 'Your Business Pvt Ltd' --state 29
```

Indexes and validators are ensured on every backend start (`npm run migrate`
runs before the server does). That is a no-op once they exist, and it means
the server can never come up against a database missing a check it depends on.

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

---

## Option 2 — front end on GitHub Pages, API elsewhere

This is the "host it from GitHub" route. Pages serves static files, so it can
host the browser app but not the API — that needs somewhere long-running that
can hold a MongoDB connection.

**1. Deploy the API first.** Any container host works; see Option 3. Point it
at your Atlas cluster (`MONGODB_URI`). Note the API's public HTTPS origin,
e.g. `https://api.yourbusiness.com`.

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
| `MONGODB_URI` | required — an Atlas connection string |
| `JWT_SECRET` | required, long and random |
| `CORS_ORIGINS` | required if a browser on another origin calls it |
| `COOKIE_CROSS_SITE` | `true` for a cross-site front end |
| `DATABASE_POOL_MAX` | below your Atlas tier's connection limit |
| `PORT` | defaults to 4000 |

Ensure indexes as a release step, or use the same command Compose does:

```
sh -c "node dist/scripts/migrate.js && node dist/index.js"
```

`GET /api/health` pings the database rather than just returning 200, so a
process that is up but cannot reach MongoDB is reported unhealthy instead of
being kept in the load balancer. Point your platform's health check at it.

The image runs as a non-root user and writes nothing to disk — no volume
needed.

Platform notes:

- **Fly.io** — `fly launch --dockerfile backend/Dockerfile`, then
  `fly secrets set JWT_SECRET=… MONGODB_URI=…`.
- **Railway / Render** — point at `backend/` as the build context, set the
  variables. Both also offer their own MongoDB add-ons if you would rather not
  use Atlas; anything that gives you a `mongodb://` or `mongodb+srv://` URI to
  a replica set works.
- **A VPS** — `docker compose up -d` from Option 1 is less work than any of
  the above.

---

## Self-hosting MongoDB instead of Atlas

Possible, and the official image makes it short, but it is more you now have
to operate: backups, upgrades, and the one thing Atlas does for you that is
easy to get wrong by hand — actually being a replica set. A single `mongod`
container is not one, and transactions do not work at all without it.

```bash
docker run -d --name billing-mongo \
  -v billing-mongo-data:/data/db \
  -p 127.0.0.1:27017:27017 \
  mongo:7 --replSet rs0

# One-time: tell it to be a (single-node) replica set.
docker exec billing-mongo mongosh --eval "rs.initiate()"
```

Then:

```
MONGODB_URI=mongodb://127.0.0.1:27017/billing?replicaSet=rs0
```

This is not wired into `docker-compose.yml` because `rs.initiate()` is a
one-time step Compose has no clean way to express as a health check — get it
running once by hand, and it stays initiated across restarts as long as the
volume persists. If you want more than one node for real durability (the
actual reason to self-host a replica set rather than the free path to
"transactions technically work"), you are past what a short recipe here should
try to cover — Atlas has already done that work.

---

## Upgrading

```bash
git pull
docker compose up -d --build
```

Indexes and validators are ensured on every start. There is no migration
ledger to fall behind — `ensureIndexes` either creates something or confirms
it already matches, every time.

Rolling back is deploying the previous image; there is no schema version to
roll back separately from the code, because there is no schema version.

---

## A short checklist before you call it live

- [ ] `JWT_SECRET` is long, random, and not the one from `.env.example`.
- [ ] The Atlas database user's password is generated, not reused, and Network
      Access is not wider than it needs to be.
- [ ] HTTPS terminates in front of the app.
- [ ] `CORS_ORIGINS` lists exactly the origins you serve the app from.
- [ ] A backup exists — Atlas does this for you on M10+; on the free tier, you
      have run `mongodump` at least once **and restored it somewhere**.
- [ ] Your entity's GSTIN, state code and address are correct — they print on
      every invoice, and posted invoices keep their own copy, so fixing it
      later does not fix the ones already issued.
- [ ] You have signed in as the admin and posted one test invoice, then voided
      it, and the trial balance still balances.

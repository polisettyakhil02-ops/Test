# Deploying to your own domain

There is no separate front end and back end to deploy. This is one Next.js
application: the pages, the Server Actions that write to the database, and the
PDF and CSV route handlers all run in the same process. You deploy **one
thing**, pointed at a MongoDB Atlas cluster.

```
      your domain                  one container              MongoDB Atlas
  billing.yourco.com  ──TLS──▶  Caddy / nginx  ──▶  app :3000  ──▶  (managed replica set)
```

## Why Atlas and not a database container

This application posts every document inside a multi-document transaction, and
MongoDB refuses transactions outright on a standalone server — it has to be a
replica set. Atlas clusters already are one; a self-hosted alternative needs
you to run and maintain that yourself (see the end of this document if you
want to anyway). For a solo developer's billing system, a free Atlas M0
cluster is the path of least maintenance.

## What you need

- A server you can reach on port 443 (any VPS will do — 1 vCPU and 1 GB of RAM
  is enough for a single-tenant billing system)
- A domain name pointed at it
- Docker with the Compose plugin
- A MongoDB Atlas cluster (see below)

## MongoDB Atlas, first

1. [cloud.mongodb.com](https://cloud.mongodb.com) → create a project → Build a
   Database → **M0** (free) is enough to start.
2. Database Access → Add New Database User. Generate a password; do not reuse
   one from elsewhere.
3. Network Access → Add IP Address. For a VPS with a static IP, add exactly
   that IP. For a dynamic one, `0.0.0.0/0` is the pragmatic choice — the
   database user's password is what actually stands between the internet and
   your data, so make it a strong, generated one.
4. Cluster → Connect → Drivers → copy the `mongodb+srv://` URI, fill in the
   password, and add a database name before the `?`:
   ```
   mongodb+srv://billing:REDACTED@cluster0.xxxxx.mongodb.net/billing?retryWrites=true&w=majority
   ```
   That whole string is `MONGODB_URI`.

## The short version

```bash
git clone <your-repo> billing && cd billing
cp .env.example .env
```

Fill in three values in `.env`:

| Variable | What to put |
|---|---|
| `MONGODB_URI` | Your Atlas connection string, from above |
| `AUTH_SECRET` | `npx auth secret`, or `openssl rand -base64 32` |
| `AUTH_URL` | Your public URL, e.g. `https://billing.yourco.com` |

Then:

```bash
docker compose up -d --build

# Create the first admin, the chart of accounts and this year's periods.
docker compose run --rm app node dist-scripts/setup.cjs \
  --email you@yourco.com --password "a long password" \
  --company "Your Company Pvt Ltd" --state 29

# Your own GSTIN and address — without these the invoice is not compliant and
# e-invoicing cannot start.
docker compose run --rm app node dist-scripts/entity.cjs \
  --gstin 29AABCU9603R1ZX \
  --legal-name "Your Company Private Limited" \
  --address "4th Floor, 22 MG Road" --address "Bengaluru - 560001" \
  --bank "HDFC Bank · A/c 00123456789 · IFSC HDFC0001234"
```

The app is now on `127.0.0.1:3000`. It is deliberately **not** exposed to the
internet — put a reverse proxy in front of it.

## TLS and your domain

The app does not terminate TLS. Give that job to something that renews
certificates for you.

**Caddy** — two lines, and certificates are automatic:

```caddy
billing.yourco.com {
    reverse_proxy 127.0.0.1:3000
}
```

**nginx**, if you already run it (get the certificate with `certbot --nginx`):

```nginx
server {
    listen 443 ssl;
    server_name billing.yourco.com;

    ssl_certificate     /etc/letsencrypt/live/billing.yourco.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/billing.yourco.com/privkey.pem;

    # A PDF or a large GSTR-1 export can take a moment to generate.
    proxy_read_timeout 120s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Those `X-Forwarded-*` headers matter: `AUTH_TRUST_HOST=true` tells Auth.js to
believe them, and without them sign-in redirects come back as `http://` and the
cookie is rejected.

## Updating

```bash
git pull
docker compose up -d --build
```

Indexes and validators are ensured automatically before the server starts on
every boot. There is no migration ledger to fall behind on — `ensureIndexes`
either creates something or confirms it already matches, every time — so a
restart that has nothing to do is a genuine no-op.

## Backups

Everything that matters is in MongoDB. Nothing is stored on the app's disk.

Atlas takes backups for you automatically on M10 and above. The free M0 tier
does not include them, so if you are running real books on it, either upgrade
or export on a schedule yourself:

```bash
# Take one
mongodump --uri="$MONGODB_URI" --archive=billing-$(date +%F).gz --gzip

# Put one back
mongorestore --uri="$MONGODB_URI" --archive=billing-2026-08-17.gz --gzip
```

Put the first line in cron if you are on M0. A billing system whose ledger you
cannot restore is a liability, and the tax authority does not accept "the disk
failed" as an explanation for missing invoices.

## Outbound events (optional)

Posting queues an event. Nothing delivers it until you ask:

```bash
# add WEBHOOK_ENDPOINT and WEBHOOK_SECRET to .env, then
docker compose --profile webhooks up -d
```

Without an endpoint configured, events simply accumulate in the outbox — visible
at `/dashboard/outbox`, and nothing is lost.

## Health

`GET /api/health` returns `200 {"status":"ok"}` only when the app can actually
reach the database, and `503` when it cannot. It is unauthenticated and says
nothing else. Point your uptime monitor at it. Compose already uses it as the
container health check.

## Without Docker

If you would rather run it directly:

```bash
npm ci
npm run build            # produces .next/standalone
npm run build:scripts    # bundles the migration and setup scripts

MONGODB_URI=... npm run migrate
MONGODB_URI=... AUTH_SECRET=... AUTH_URL=https://... node .next/standalone/server.js
```

Copy `.next/static` to `.next/standalone/.next/static` and `public` to
`.next/standalone/public` first — the standalone server does not serve them from
their build locations. Run it under systemd or pm2 so it restarts on reboot.

## A managed platform instead

The app is a standard Next.js server, so Vercel, Railway, Render or Fly all
work without changes. You still need `MONGODB_URI`, `AUTH_SECRET` and
`AUTH_URL` set, and you still need to run `npm run migrate` and the setup
script once against that database.

The one thing to check on a serverless platform is the connection pool:
`DATABASE_POOL_MAX` defaults to 10 per instance, which many instances multiply
into more connections than a small Atlas tier will accept. Lower it if you are
on M0/M2/M5.

## Self-hosting MongoDB instead of Atlas

Possible, and the official image makes it short, but it is more you now have
to operate — backups, upgrades, and the one thing Atlas does for you that is
easy to get wrong by hand: actually being a replica set. A single `mongod`
container is not one, and this application's transactions do not work at all
without it.

```bash
docker run -d --name billing-mongo \
  -v billing-mongo-data:/data/db \
  -p 127.0.0.1:27017:27017 \
  mongo:7 --replSet rs0

# One-time: tell it to be a (single-node) replica set.
docker exec billing-mongo mongosh --eval "rs.initiate()"
```

Then `MONGODB_URI=mongodb://127.0.0.1:27017/billing?replicaSet=rs0`. This is
not wired into `docker-compose.yml` because `rs.initiate()` is a one-time step
Compose has no clean way to express as a health check — run it once by hand,
and it stays initiated across restarts as long as the volume persists.

## Before you invoice a real customer

- [ ] `AUTH_SECRET` is random and not the one from `.env.example`
- [ ] `AUTH_URL` is your real https URL
- [ ] Your GSTIN, address with PIN code, and bank details are set — check with
      `docker compose run --rm app node dist-scripts/entity.cjs`
- [ ] The Atlas database user's password is generated, not reused, and Network
      Access is not wider than it needs to be
- [ ] A backup exists — Atlas does this for you on M10+; on the free tier, you
      have run `mongodump` at least once *and restored it*, so you know it works
- [ ] You have raised one test invoice, posted it, and checked the PDF

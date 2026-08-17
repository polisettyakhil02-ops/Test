# Deploying to your own domain

There is no separate front end and back end to deploy. This is one Next.js
application: the pages, the Server Actions that write to the database, and the
PDF and CSV route handlers all run in the same process. You deploy **one thing**,
and it needs **one thing** alongside it — a PostgreSQL database.

```
      your domain                  one container                 one database
  billing.yourco.com  ──TLS──▶  Caddy / nginx  ──▶  app :3000  ──▶  PostgreSQL
```

## What you need

- A server you can reach on port 443 (any VPS will do — 1 vCPU and 1 GB of RAM
  is enough for a single-tenant billing system)
- A domain name pointed at it
- Docker with the Compose plugin

## The short version

```bash
git clone <your-repo> billing && cd billing
cp .env.example .env
```

Fill in three values in `.env`:

| Variable | What to put |
|---|---|
| `POSTGRES_PASSWORD` | Any long random string. Compose builds `DATABASE_URL` from it. |
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

Migrations run automatically before the server starts, in one transaction each,
and record what they have applied — so a restart that has nothing to do is a
no-op, and a half-applied schema change cannot happen.

## Backups

Everything that matters is in PostgreSQL. Nothing is stored on the app's disk.

```bash
# Take one
docker compose exec -T db pg_dump -U billing billing | gzip > billing-$(date +%F).sql.gz

# Put one back
gunzip -c billing-2026-08-17.sql.gz | docker compose exec -T db psql -U billing billing
```

Put that first line in cron. A billing system whose ledger you cannot restore is
a liability, and the tax authority does not accept "the disk failed" as an
explanation for missing invoices.

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

DATABASE_URL=... npm run migrate
DATABASE_URL=... AUTH_SECRET=... AUTH_URL=https://... node .next/standalone/server.js
```

Copy `.next/static` to `.next/standalone/.next/static` and `public` to
`.next/standalone/public` first — the standalone server does not serve them from
their build locations. Run it under systemd or pm2 so it restarts on reboot.

## A managed platform instead

The app is a standard Next.js server, so Vercel, Railway, Render or Fly all work
without changes. You still need a PostgreSQL instance (Neon, Supabase, RDS —
anything that gives you a connection string), and you still need to set
`DATABASE_URL`, `AUTH_SECRET` and `AUTH_URL`, and to run `npm run migrate` and
the setup script once against that database.

The one thing to check on a serverless platform is the connection pool:
`DATABASE_POOL_MAX` defaults to 10 per instance, which many instances multiply
into more connections than a small Postgres will accept. Lower it, or put
PgBouncer in between.

## Before you invoice a real customer

- [ ] `AUTH_SECRET` is random and not the one from `.env.example`
- [ ] `AUTH_URL` is your real https URL
- [ ] Your GSTIN, address with PIN code, and bank details are set — check with
      `docker compose run --rm app node dist-scripts/entity.cjs`
- [ ] The database port is not published to the internet (compose does not)
- [ ] A backup has been taken *and* restored once, so you know it works
- [ ] You have raised one test invoice, posted it, and checked the PDF

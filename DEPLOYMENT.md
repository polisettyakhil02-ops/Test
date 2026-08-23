# HIMS Platform — Production Deployment Guide

Deploys the full stack from `docker/docker-compose.prod.yml` to a single
Linux host (AWS EC2, a DigitalOcean Droplet, or any standard VPS) — a
3-node MongoDB replica set, Redis, the API, the frontend, and an Nginx
edge proxy terminating TLS. Written and tested against **Ubuntu 24.04
LTS**; the Docker steps are the same on any systemd-based distro.

```
Internet
   │  :80 / :443
   ▼
nginx-proxy  (TLS, security headers, rate limiting)
   │                          │
   ▼                          ▼
web (Nginx, static SPA)   api (Node/Express)
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
                mongo1 ──── mongo2 ──── mongo3   (replica set rs0)
                    │
                  redis
```

`mongo1/2/3` and `redis` live on an `internal: true` Docker network —
unreachable from outside the host by design, regardless of firewall
config. Only `nginx-proxy` publishes ports to the internet.

## 1. Prerequisites

- A fresh Ubuntu 24.04 server with a non-root sudo user, and a domain's
  DNS `A` (and `AAAA`, if using IPv6) record already pointing at the
  server's public IP — Let's Encrypt validates ownership over HTTP, so
  this must resolve correctly *before* Step 6.
- Ports 80 and 443 open inbound (see the firewall step below).

## 2. Install Docker Engine + Compose plugin

Using Docker's official `apt` repository (not the convenience script —
this is the method Docker documents for production hosts):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo (log out and back in for this to take effect):
sudo usermod -aG docker "$USER"
```

Verify: `docker compose version` should print a v2.x version.

## 3. Firewall

```bash
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Nothing else needs to be opened — MongoDB and Redis are only reachable
over the internal Docker network, and their host port bindings in
`docker-compose.prod.yml` are already bound to `127.0.0.1` only.

## 4. Clone the repo and lay out secrets

```bash
sudo mkdir -p /opt/hims && sudo chown "$USER":"$USER" /opt/hims
git clone <your-fork-url> /opt/hims
cd /opt/hims/docker

mkdir -p secrets
openssl rand -base64 756 > secrets/mongo-keyfile
chmod 400 secrets/mongo-keyfile
sudo chown 999:999 secrets/mongo-keyfile   # 999 = the mongo:7.0 image's internal "mongodb" uid/gid

cp .env.example .env
```

## 5. Fill in `.env`

Every variable is documented inline in `docker/.env.example`; the table
below is the quick-reference version. Generate every secret freshly for
this deployment — never reuse one from another environment.

| Variable | Purpose | How to generate |
|---|---|---|
| `MONGO_KEYFILE_PATH` | Path to the file from Step 4 | Already set correctly by default |
| `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` | Cluster admin, used once by `mongo-setup` | `openssl rand -base64 24` for the password |
| `MONGO_APP_USERNAME` / `MONGO_APP_PASSWORD` | Scoped app user (readWrite on `hims` only) the API actually connects as | `openssl rand -base64 24` for the password |
| `REDIS_PASSWORD` | Redis auth | `openssl rand -base64 24` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing — **must differ from each other** | `openssl rand -base64 48`, run twice |
| `COOKIE_SECRET` | Signs the auth cookie | `openssl rand -base64 48` |
| `CORS_ORIGIN` | Your public origin, e.g. `https://hims.example.com` | — |
| `DOMAIN_NAME` / `CERTBOT_EMAIL` | Used by the certbot commands in Step 6, not by Compose | — |

Edit with your editor of choice, e.g. `nano .env`, and paste each
generated value in. Then lock down permissions on the finished file:

```bash
chmod 600 .env
```

## 6. Point Nginx at your domain and bootstrap TLS

Replace the placeholder domain in the edge proxy config:

```bash
source .env   # loads DOMAIN_NAME/CERTBOT_EMAIL into this shell
sed -i "s/yourdomain.com/${DOMAIN_NAME}/g" nginx/default.conf
```

`nginx-proxy` won't start yet — its config points at certificate files
that don't exist. Create a throwaway self-signed certificate at that
path purely so Nginx can boot and start serving the ACME HTTP-01
challenge that will get you the *real* certificate:

```bash
docker compose -f docker-compose.prod.yml run --rm --entrypoint sh certbot -c "
  command -v openssl >/dev/null 2>&1 || apk add --no-cache openssl >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq openssl); \
  mkdir -p /etc/letsencrypt/live/${DOMAIN_NAME} && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem \
    -out /etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem \
    -subj '/CN=localhost' && \
  cp /etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem /etc/letsencrypt/live/${DOMAIN_NAME}/chain.pem
"
```

Bring up the whole stack (this also builds the `api`/`web` images — see
Step 7 for what happens during first boot):

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f mongo-setup   # watch it finish, then Ctrl-C
```

With `nginx-proxy` now up and serving the dummy cert, remove it and
request the real one over the ACME HTTP-01 challenge (the cleanup step
is necessary — Certbot won't overwrite a certificate directory it
doesn't recognize as its own):

```bash
docker compose -f docker-compose.prod.yml run --rm --entrypoint sh certbot -c "
  rm -Rf /etc/letsencrypt/live/${DOMAIN_NAME} /etc/letsencrypt/archive/${DOMAIN_NAME} /etc/letsencrypt/renewal/${DOMAIN_NAME}.conf
"

docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "${DOMAIN_NAME}" -d "www.${DOMAIN_NAME}" \
  --email "${CERTBOT_EMAIL}" --agree-tos --no-eff-email

docker compose -f docker-compose.prod.yml exec nginx-proxy nginx -s reload
```

Visit `https://<your-domain>` — you should see a valid certificate and
the HIMS login page.

## 7. What happens on first boot

1. `mongo1`/`mongo2`/`mongo3` start with `--keyFile` (which implies
   `--auth`) and `--replSet`, and report healthy as soon as they accept
   connections — they are **not** an initiated replica set yet at that
   point.
2. `mongo-setup` waits for all three, runs `rs.initiate()`, waits for a
   `PRIMARY` to be elected, then creates the root admin user and the
   scoped `hims_app` user (readWrite on `hims` only) — see
   `docker/mongo/init-replica.sh` for exactly how it uses MongoDB's
   "localhost exception" to do this before any user exists. It exits 0
   when done; this is expected, it's not supposed to keep running.
3. `api` waits for `mongo-setup` to exit successfully and `redis` to be
   healthy, then starts.
4. `nginx-proxy` waits for `api` and `web` to both report healthy.

Re-running `docker compose up -d` later (a redeploy, a reboot) is safe —
every step in `init-replica.sh` detects work that's already done and
skips it.

## 8. Verify

```bash
docker compose -f docker-compose.prod.yml ps
curl -sf https://<your-domain>/healthz && echo OK

# Replica set health:
docker compose -f docker-compose.prod.yml exec mongo1 mongosh --quiet \
  -u "$MONGO_APP_USERNAME" -p "$MONGO_APP_PASSWORD" --authenticationDatabase "$MONGO_APP_DATABASE" \
  --eval 'rs.status().members.map(m => ({name: m.name, state: m.stateStr}))'
```

## 9. Certificate renewal

Let's Encrypt certificates expire after 90 days. Automate renewal with a
systemd timer (preferred over cron on a systemd host like Ubuntu 24.04):

```bash
sudo tee /etc/systemd/system/hims-certbot-renew.service > /dev/null <<'EOF'
[Unit]
Description=Renew HIMS Let's Encrypt certificate

[Service]
Type=oneshot
WorkingDirectory=/opt/hims/docker
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml run --rm certbot renew --webroot -w /var/www/certbot --quiet
ExecStartPost=/usr/bin/docker compose -f docker-compose.prod.yml exec nginx-proxy nginx -s reload
EOF

sudo tee /etc/systemd/system/hims-certbot-renew.timer > /dev/null <<'EOF'
[Unit]
Description=Twice-daily HIMS certificate renewal check

[Timer]
OnCalendar=*-*-* 03,15:00:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now hims-certbot-renew.timer
```

`certbot renew` only actually replaces a certificate once it's within
30 days of expiry, so running it twice a day is the standard,
inexpensive way to never miss a renewal window.

## 10. Common operations

```bash
# Redeploy after pulling new code:
cd /opt/hims && git pull
cd docker && docker compose -f docker-compose.prod.yml up -d --build

# Tail logs:
docker compose -f docker-compose.prod.yml logs -f api

# Restart just one service:
docker compose -f docker-compose.prod.yml restart api

# Stop everything (data volumes persist):
docker compose -f docker-compose.prod.yml down
```

## Security notes

- `mongo1/2/3` and `redis` are on an `internal: true` Docker network —
  no container on it can reach the internet, and nothing outside the
  Docker host can reach them at all.
- Every Dockerfile (`docker/Dockerfile.server`, `docker/Dockerfile.client`)
  runs its application process as a non-root user.
- `docker/.env` and `docker/secrets/mongo-keyfile` contain live
  credentials — `chmod 600`/`400` them (Steps 4-5 already do this) and
  never commit them; both are covered by `.gitignore`.
- Rotating a secret (JWT, Mongo/Redis passwords) means updating `.env`
  and recreating the affected containers (`docker compose up -d`) —
  rotating `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` invalidates every
  existing session, so do it during a maintenance window.

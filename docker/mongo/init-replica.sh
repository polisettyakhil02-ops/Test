#!/usr/bin/env bash
#
# Runs once, in the transient `mongo-setup` container, to bring up the
# 3-node replica set and create its users. Safe to re-run (e.g. on
# `docker compose up` after the stack has already been initialized once) —
# every step checks whether it already happened before attempting it.
#
# THE LOCALHOST-EXCEPTION GOTCHA THIS SCRIPT IS BUILT AROUND:
# mongod started with --keyFile enforces auth from the moment it starts,
# with one carve-out: a client connecting via the true loopback interface
# may run admin commands (including creating the very first user) before
# any user exists yet — the "localhost exception". A connection from
# another *container* on the same Docker network is NOT the loopback
# interface as far as mongod is concerned, even though it's the same
# physical host, so a naive `mongo-setup` service talking to `mongo1:27017`
# over the bridge network cannot use it. docker-compose.prod.yml works
# around this by giving `mongo-setup` `network_mode: "service:mongo1"`,
# which makes it share mongo1's network *namespace* outright — so
# `localhost:27017` from inside this container really is mongo1's
# loopback interface, and the exception applies. Once the first user
# (the root admin) is created, the exception closes permanently; every
# step after that authenticates explicitly.
set -euo pipefail

MONGO_HOST="${MONGO_HOST:-localhost}"
MONGO_PORT="${MONGO_PORT:-27017}"
RS_NAME="${MONGO_REPLICA_SET_NAME:-rs0}"
ROOT_USER="${MONGO_INITDB_ROOT_USERNAME:?MONGO_INITDB_ROOT_USERNAME is required}"
ROOT_PASS="${MONGO_INITDB_ROOT_PASSWORD:?MONGO_INITDB_ROOT_PASSWORD is required}"
APP_USER="${MONGO_APP_USERNAME:?MONGO_APP_USERNAME is required}"
APP_PASS="${MONGO_APP_PASSWORD:?MONGO_APP_PASSWORD is required}"
APP_DB="${MONGO_APP_DATABASE:-hims}"

MAX_WAIT_ATTEMPTS=60   # 60 * 2s = 2 minutes per host before giving up
RETRY_DELAY_SECONDS=2

log() { echo "[mongo-setup] $(date -u +%H:%M:%S) $*"; }

# mongod's `ping` command is on the small allowlist of commands that never
# require authentication, so this works identically whether or not auth
# has been fully bootstrapped yet.
wait_for_mongo() {
  local host="$1"
  local attempt=0
  log "waiting for ${host}:${MONGO_PORT}..."
  until mongosh --quiet --host "$host" --port "$MONGO_PORT" \
      --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$MAX_WAIT_ATTEMPTS" ]; then
      log "ERROR: gave up waiting for ${host}:${MONGO_PORT} after $((MAX_WAIT_ATTEMPTS * RETRY_DELAY_SECONDS))s"
      exit 1
    fi
    sleep "$RETRY_DELAY_SECONDS"
  done
  log "${host}:${MONGO_PORT} is reachable"
}

wait_for_mongo mongo1
wait_for_mongo mongo2
wait_for_mongo mongo3

log "attempting rs.initiate() for replica set '${RS_NAME}' (via the loopback interface)..."
INITIATE_OUTPUT=$(mongosh --quiet --host "$MONGO_HOST" --port "$MONGO_PORT" --eval "
  rs.initiate({
    _id: '${RS_NAME}',
    members: [
      { _id: 0, host: 'mongo1:27017', priority: 2 },
      { _id: 1, host: 'mongo2:27017', priority: 1 },
      { _id: 2, host: 'mongo3:27017', priority: 1 }
    ]
  })
" 2>&1) || true

if echo "$INITIATE_OUTPUT" | grep -qi "already initialized"; then
  log "replica set was already initiated — continuing"
elif echo "$INITIATE_OUTPUT" | grep -Eqi '"ok"\s*:\s*1'; then
  log "replica set initiated"
else
  log "unexpected rs.initiate() output, continuing anyway in case it's transient:"
  echo "$INITIATE_OUTPUT"
fi

log "waiting for a PRIMARY to be elected..."
attempt=0
until mongosh --quiet --host "$MONGO_HOST" --port "$MONGO_PORT" \
    --eval 'db.hello().isWritablePrimary' 2>/dev/null | grep -qi true; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$MAX_WAIT_ATTEMPTS" ]; then
    log "ERROR: no PRIMARY elected after $((MAX_WAIT_ATTEMPTS * RETRY_DELAY_SECONDS))s"
    exit 1
  fi
  sleep "$RETRY_DELAY_SECONDS"
done
log "PRIMARY is up"

log "attempting to create root user '${ROOT_USER}' (via the loopback interface, before the localhost exception closes)..."
CREATE_ROOT_OUTPUT=$(mongosh --quiet --host "$MONGO_HOST" --port "$MONGO_PORT" admin --eval "
  db.createUser({
    user: '${ROOT_USER}',
    pwd: '${ROOT_PASS}',
    roles: [{ role: 'root', db: 'admin' }]
  })
" 2>&1) || true

if echo "$CREATE_ROOT_OUTPUT" | grep -Eqi "already exists|requires authentication|Unauthorized"; then
  log "root user already exists (or the localhost exception has already closed) — skipping"
elif echo "$CREATE_ROOT_OUTPUT" | grep -qi "Successfully added user"; then
  log "root user created"
else
  log "unexpected createUser output for root user:"
  echo "$CREATE_ROOT_OUTPUT"
fi

log "ensuring scoped application user '${APP_USER}' exists on database '${APP_DB}' (authenticated as root)..."
CREATE_APP_OUTPUT=$(mongosh --quiet --host "$MONGO_HOST" --port "$MONGO_PORT" admin \
  -u "$ROOT_USER" -p "$ROOT_PASS" --authenticationDatabase admin --eval "
  db.getSiblingDB('${APP_DB}').createUser({
    user: '${APP_USER}',
    pwd: '${APP_PASS}',
    roles: [{ role: 'readWrite', db: '${APP_DB}' }]
  })
" 2>&1) || true

if echo "$CREATE_APP_OUTPUT" | grep -qi "already exists"; then
  log "application user already exists — skipping"
elif echo "$CREATE_APP_OUTPUT" | grep -qi "Successfully added user"; then
  log "application user created with readWrite on '${APP_DB}' only (least privilege — not root)"
else
  log "unexpected createUser output for application user:"
  echo "$CREATE_APP_OUTPUT"
  exit 1
fi

log "mongo replica set initialization complete"

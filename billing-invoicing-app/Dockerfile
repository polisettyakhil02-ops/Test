# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- dependencies
# Separate stage so a change to application code does not invalidate the
# npm install layer -- only a change to the lockfile does.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ----------------------------------------------------------------------- build
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next inlines NEXT_PUBLIC_* at build time. Nothing here needs one today; if you
# add one, it has to be passed as a build arg, not just at runtime.
ENV NEXT_TELEMETRY_DISABLED=1

# `next build` runs typegen and typechecks, so a build that would not compile
# fails here rather than at boot on your server.
RUN npm run build

# The deploy scripts are bundled to self-contained CommonJS. The alternative --
# shipping tsx and running the TypeScript directly -- means an `npm install` in
# the runner, which reconciles against the standalone package.json and prunes
# the very dependencies the build traced into it.
RUN npm run build:scripts

# ---------------------------------------------------------------------- runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user. The image has no business being able to write to
# itself, and a container escape starts from whatever this process can do.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nextjs

# The standalone output carries its own minimal node_modules, traced from what
# the server actually reaches. Static assets and public/ are not part of it and
# have to be copied alongside.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Migrations run from the container at deploy time, so the SQL has to be in the
# image. The scripts that apply it are already bundled -- no node_modules of
# their own, and nothing to install here.
COPY --from=build --chown=nextjs:nodejs /app/dist-scripts ./dist-scripts
COPY --from=build --chown=nextjs:nodejs /app/src/db/migrations ./src/db/migrations
COPY --from=build --chown=nextjs:nodejs /app/src/db/ledger-guards.sql ./src/db/ledger-guards.sql

USER nextjs
EXPOSE 3000

# The probe hits the app's own health route, which queries PostgreSQL: a process
# that is up but cannot reach the database is not healthy, and a check that says
# otherwise keeps it in the load balancer.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

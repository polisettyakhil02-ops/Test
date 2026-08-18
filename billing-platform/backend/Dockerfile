# The API service.
#
# Two stages: one with the toolchain and the dev dependencies, and a runner with
# neither. The runner installs production dependencies from the lockfile rather
# than copying node_modules across, so the image contains exactly what
# package-lock.json pins and nothing that was only needed to build.

FROM node:22-alpine AS builder
WORKDIR /app

# Dependencies first, so a source-only change reuses this layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Typechecks, bundles the server and the operational scripts with esbuild, and
# copies the migration SQL into dist. Bundling keeps the `@/...` path aliases
# working without a second resolution scheme at runtime; `--packages=external`
# leaves node_modules alone, so nothing is duplicated into the bundle.
RUN npm run build


FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Never root. The process writes nothing to disk — all state is in PostgreSQL —
# so it needs to own nothing.
RUN addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER app
EXPOSE 4000

# Queries the database rather than just answering 200, so a process that is up
# but cannot reach PostgreSQL is reported unhealthy instead of being kept in the
# load balancer.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Compose overrides this to run migrations first. On its own, the image just
# serves.
CMD ["node", "dist/index.js"]

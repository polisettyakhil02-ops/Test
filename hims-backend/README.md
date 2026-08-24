# hims-backend

TypeScript / Express / MongoDB (replica set) / Redis API server for the
Hospital Information Management System. See `/ARCHITECTURE.md` at the repo
root for the full system design and roadmap; this README covers only
running this service.

## Prerequisites

- Node.js 20+
- A MongoDB **replica set** (not a standalone instance — multi-document
  transactions require it). For local dev, run a single-node replica set:
  `docker run -d -p 27017:27017 mongo:7 --replSet rs0` then
  `docker exec -it <container> mongosh --eval 'rs.initiate()'`.
- Redis 7+

## Setup

```bash
cp .env.example .env   # fill in real secrets
npm install
npm run dev             # tsx watch, http://localhost:4000
```

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Runs the server with hot reload (tsx watch) |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm start` | Runs the compiled `dist/server.js` |
| `npm run typecheck` | `tsc --noEmit` across `src/` |
| `npm run lint` | ESLint over `src/**/*.ts` |
| `npm test` | Vitest |

## Current state (Steps 1-16 complete)

Every domain in `/ARCHITECTURE.md` is fully implemented end to end: schemas
(`src/models/`), services (`src/services/`), controllers/routes
(`src/controllers/`, `src/routes/`), auth/RBAC middleware, the audit-logging
interceptor, and the Docker/Nginx production deployment (`../docker/`,
`../DEPLOYMENT.md`). See `/ARCHITECTURE.md` at the repo root for the full,
step-by-step design record of every module.

There's no public self-registration route — the very first admin user must
be inserted directly into MongoDB before you can log in and create everyone
else through the app. See the root `README.md`'s "Bootstrapping the first
admin user" section for the exact steps.

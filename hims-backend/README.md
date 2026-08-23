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

## Current state (Step 1 of the build roadmap)

This checkpoint delivers the project scaffold, shared types, and the
complete set of Mongoose schemas across all 11 domains (`src/models/`),
plus the DB/Redis connection helpers including the `withTransaction`
ACID-transaction wrapper (`src/config/database.ts`) that every billing,
inventory, and bed-ADT service in later steps must use.

Not yet implemented (tracked for Steps 2-5): auth/RBAC middleware, the
audit-logging interceptor, domain services, controllers/routes, the
frontend app, and the Docker/Nginx production deployment.

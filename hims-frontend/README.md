# hims-frontend

React 18 + Vite + TypeScript + Tailwind CSS + TanStack Query client for the
HIMS platform. See `/ARCHITECTURE.md` at the repo root for the full system
design; this README covers only running this app.

## Setup

```bash
cp .env.example .env    # optional in dev — see the comment in the file
npm install
npm run dev              # http://localhost:5173, proxies /api to hims-backend on :4000
```

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server with the `/api` proxy to hims-backend |
| `npm run build` | Type-checks (`tsc -b`) then builds to `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run typecheck` | `tsc -b --noEmit` |

## Backend endpoints

Every hook under `src/hooks/` calls a real, implemented `hims-backend` route
— there are no remaining gaps. See `/ARCHITECTURE.md` at the repo root for
the full endpoint-by-endpoint design record.

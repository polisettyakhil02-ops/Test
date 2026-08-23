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

## Backend endpoints this app assumes exist

Everything under `src/hooks/` calls a real `hims-backend` route from Step 3
**except** the four auth endpoints and three smaller reads that Step 3 didn't
build. Each is called from exactly one hook/file, marked with a
`// BACKEND GAP:` comment, so `grep -rn "BACKEND GAP" src` finds the full list.
Until they exist server-side, login and the features that depend on them
(discharge, drug search in the prescription builder, the occupied-bed detail
drawer) won't return real data.

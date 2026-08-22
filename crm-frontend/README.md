# Dominare CRM - Frontend

Vite + React frontend for the Dominare Tech internal CRM. Talks to
`crm-backend` over `fetch()`; no server-side rendering.

## Setup

```bash
cd crm-frontend
npm install
cp .env.example .env   # point VITE_API_BASE at your crm-backend, if not localhost:4000
npm run dev             # http://localhost:5174
```

Requires `crm-backend` running (and seeded - see `crm-backend/README.md`) so
there's something to log into.

```bash
npm run build    # production build into dist/
npm run preview  # serve the production build locally
```

## Pages

| Route | Who sees it | What it does |
|---|---|---|
| `/login` | Everyone | Email/password sign-in |
| `/` | Any role | Dashboard, scoped by role: admin/sales see pipeline value, win rate, task/stage breakdowns, recent activity; developers see only their own tasks (open/overdue/completed, by status, task list) |
| `/companies`, `/companies/:id` | Any role (write: admin/sales) | Company directory + linked contacts/deals |
| `/contacts`, `/contacts/:id` | Any role (write: admin/sales) | Contact directory + activity timeline |
| `/deals`, `/deals/:id` | Any role (write: admin/sales) | Pipeline board grouped by stage, deal detail with linked tasks + activity |
| `/tasks` | Any role | Task board grouped by status; developers see/edit only their own by default; admin/sales can create and assign |
| `/users` | Admin only | Create team accounts, activate/deactivate |

Role-based UI (which nav links and write controls show) mirrors the
backend's `src/lib/permissions.js` - the backend is still the source of
truth and re-checks every write, the frontend just avoids showing controls
a given role can't use.

## Auth

JWT is stored in `localStorage` and attached as `Authorization: Bearer` on
every API call (`src/api/client.js`). There's no token refresh - sessions
last as long as the backend's `JWT_EXPIRES_IN`, after which the user is
redirected to `/login` on the next failed request.

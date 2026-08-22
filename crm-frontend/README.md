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
| `/companies`, `/companies/:id` | Any role (write: admin/sales) | Company directory + linked contacts/deals. Text filter, "show archived" toggle, archive/restore, CSV export |
| `/contacts`, `/contacts/:id` | Any role (write: admin/sales) | Contact directory + activity timeline. Same filter/archive/CSV controls as companies; create rejects a duplicate email |
| `/deals`, `/deals/:id` | Any role (write: admin/sales) | Pipeline board grouped by stage, deal detail with linked tasks + activity. Owner filter, archive/restore, CSV export; moving a deal to "lost" prompts for a reason, logged to its activity timeline |
| `/deals/new` | Admin/sales | **Register a deal.** Pick a company, check for open deals already on that account, and either create straight away or show what's already active and require an explicit "register anyway" (logged to the new deal's activity). Pipeline's "Register deal" button leads here. |
| `/tasks` | Any role | Task board grouped by status; developers see/edit only their own by default; admin/sales can create tasks *and reassign any existing task's assignee directly from the board* (not just at creation time) - the (re)assignee gets a notification |
| `/users` | Admin only | Create team accounts, activate/deactivate |
| `/profile` | Any role | Change your own password |

The header also has a **search box** (companies/contacts/deals, `src/components/SearchBar.jsx`)
and a **notification bell** (`src/components/NotificationBell.jsx`, polls every 30s) on every
authenticated page.

Role-based UI (which nav links and write controls show) mirrors the
backend's `src/lib/permissions.js` - the backend is still the source of
truth and re-checks every write, the frontend just avoids showing controls
a given role can't use.

## Auth

JWT is stored in `localStorage` and attached as `Authorization: Bearer` on
every API call (`src/api/client.js`). There's no token refresh - sessions
last as long as the backend's `JWT_EXPIRES_IN`, after which the user is
redirected to `/login` on the next failed request.

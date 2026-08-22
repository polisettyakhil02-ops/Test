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
| `/` | Any role | Dashboard, scoped by role: admin/sales see pipeline value, win rate, a **weighted forecast** (pipeline value discounted by stage-probability - a "proposal" deal counts for 75% of its value, not the full amount) with a per-stage breakdown, task/stage breakdowns, recent activity; developers see only their own tasks (open/overdue/completed, by status, task list) |
| `/leads`, `/leads/:id` | Admin/sales only | Lead board grouped by lead-specific stages (new/contacted/qualified/nurturing/disqualified - separate from deal stages), lead detail with enrichment fields (LinkedIn, company website, phone), lead-specific tasks, notes, and a **Convert to deal** action that creates/reuses a company + contact and opens the resulting deal |
| `/companies`, `/companies/:id` | Admin/sales only | Company directory + linked contacts/deals. Text filter, "show archived" toggle, archive/restore, CSV export |
| `/contacts`, `/contacts/:id` | Admin/sales only | Contact directory + file attachments + activity timeline. Same filter/archive/CSV controls as companies; create rejects a duplicate email |
| `/deals`, `/deals/:id` | Admin/sales only | Pipeline board grouped by stage, deal detail with linked tasks, file attachments, and activity. Owner filter, archive/restore, CSV export; moving a deal to "lost" prompts for a reason, logged to its activity timeline |
| `/deals/new` | Admin/sales only | **Register a deal.** Pick a company, check for open deals already on that account, and either create straight away or show what's already active and require an explicit "register anyway" (logged to the new deal's activity). Pipeline's "Register deal" button leads here. |
| `/tasks` | Any role | Task board grouped by status, with a **Tasks / Bugs / All work** type filter. Developers see/edit only their own by default, and see which client or lead each task is for as a plain read-only label (no link into the pipeline). A bug card shows a severity badge. Admin/sales can create tasks or bugs (the "New task" form reveals severity/environment/steps-to-reproduce fields when Type is set to Bug) *and reassign any existing task's assignee directly from the board* (not just at creation time) - the (re)assignee gets a notification. This board, the Pipeline board, and the Leads board all support **drag-and-drop** (`src/components/DndBoard.jsx`) to move a card between columns, in addition to the status/stage dropdown each card still has |
| `/tasks/:id` | Any role | Task detail: status/assignee, an editable description/priority/due-date (admin/sales), a subtask checklist, file attachments, and a comment thread - the same write rule throughout as the board's status dropdown (admin/sales, or the assignee). Bugs (`type: 'bug'`) get an extra **Bug details** card: severity, environment, steps to reproduce, expected vs. actual behavior, editable alongside the description |
| `/users` | Admin only | Create team accounts, activate/deactivate |
| `/rules` | Admin only | **Automation.** Create/edit/delete rules that fire on a CRM event (deal created/stage changed, task created/assigned/status changed) with an optional single field-match condition, and either send a notification or create a task - templated with `{{field}}` placeholders. Enable/disable any rule with a checkbox without deleting it |
| `/profile` | Any role | Change your own password |

A developer's nav doesn't show Leads, Pipeline, Companies, or Contacts at all - not
just because there's nothing useful there, but because the backend rejects
those requests outright (`403`). The routes are also role-gated in
`App.jsx`, so a developer hitting one of those URLs directly gets redirected
to the dashboard instead of landing on a raw error banner.

The header also has a **search box** (companies/contacts/deals,
`src/components/SearchBar.jsx`) - admin/sales only, since it only searches
data a developer can't see anyway - and a **notification bell**
(`src/components/NotificationBell.jsx`, polls every 30s, every role) on
every authenticated page.

Role-based UI (which nav links, routes, and write controls show) mirrors the
backend's `src/lib/permissions.js` - the backend is still the source of
truth and re-checks every request, the frontend just avoids showing or
routing to controls a given role can't use.

## Auth

JWT is stored in `localStorage` and attached as `Authorization: Bearer` on
every API call (`src/api/client.js`). There's no token refresh - sessions
last as long as the backend's `JWT_EXPIRES_IN`, after which the user is
redirected to `/login` on the next failed request.

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
| `/leads`, `/leads/:id` | Admin/sales only | Lead board grouped by lead-specific stages (new/contacted/qualified/nurturing/disqualified - separate from deal stages). The New Lead form opens with a **Smart drop zone** (`src/components/LeadDropZone.jsx`) - drag or paste a company website and/or LinkedIn URL, Parse to preview a suggested company name/logo/description, contact name, and a matched discovery guide, then "Use this" to prefill the form (still editable before saving). A saved lead with a matched guide shows a permanent **Discovery guide** card on its detail page. Lead detail also has lead-specific tasks, notes, and a **Convert to deal** action that creates/reuses a company + contact and opens the resulting deal |
| `/companies`, `/companies/:id` | Admin/sales only | Company directory + linked contacts/deals. Text filter, "show archived" toggle, archive/restore, CSV export |
| `/contacts`, `/contacts/:id` | Admin/sales only | Contact directory + file attachments + activity timeline. Same filter/archive/CSV controls as companies; create rejects a duplicate email |
| `/deals`, `/deals/:id` | Admin/sales only | Pipeline board grouped by stage, deal detail with linked tasks, file attachments, and activity. Owner filter, archive/restore, CSV export; moving a deal to "lost" prompts for a reason, logged to its activity timeline |
| `/deals/new` | Admin/sales only | **Register a deal.** Pick a company, check for open deals already on that account, and either create straight away or show what's already active and require an explicit "register anyway" (logged to the new deal's activity). Pipeline's "Register deal" button leads here. |
| `/tasks` | Any role | Task board grouped by status, with a **Features / Bugs / Tech debt / All work** issue-type filter. Developers see/edit only their own by default, and see which client, lead, or project each task is for as a plain read-only label (no link into the pipeline). A bug card shows a severity badge. Admin/sales can create tasks (the "New task" form reveals severity/environment/steps-to-reproduce fields when Type is set to Bug) *and reassign any existing task's assignee directly from the board* (not just at creation time) - the (re)assignee gets a notification. This board, the Pipeline board, and the Leads board all support **drag-and-drop** (`src/components/DndBoard.jsx`) to move a card between columns, in addition to the status/stage dropdown each card still has |
| `/tasks/:id` | Any role | Task detail: status/assignee, an editable description/priority/due-date (admin/sales), a subtask checklist, **code snippets** (label + language + a pasted fragment or stack trace, rendered in a `<pre><code>` block), file attachments, and a comment thread - the same write rule throughout as the board's status dropdown (admin/sales, or the assignee). Bugs (`issueType: 'bug'`) get an extra **Bug details** card: severity, environment, steps to reproduce, expected vs. actual behavior, editable alongside the description |
| `/projects` | Any role | **Developer Dashboard** - the "Developer Creative Space" (`src/pages/Projects.jsx`). A Project Selector (internal builds or brand campaigns, e.g. a "Finale" launch), a per-project **Scratchpad** for dumping notes/snippets that aren't a task yet, a cross-project **Backlog** of unassigned bugs (any role can **Claim** one for themselves - the one reassignment a developer can do without admin/sales), and an **Active Kanban Board** scoped to the selected project, reusing the same drag-and-drop board as `/tasks`. New project/New task forms match the same shape as `/tasks` (task creation stays admin/sales-only) |
| `/users` | Admin only | Create team accounts, activate/deactivate |
| `/rules` | Admin only | **Automation.** Create/edit/delete rules that fire on a CRM event (deal created/stage changed, task created/assigned/status changed) with an optional single field-match condition, and either send a notification or create a task - templated with `{{field}}` placeholders. Enable/disable any rule with a checkbox without deleting it |
| `/chat` | Any role | **Real-time chat.** A channel list (the shared #General team channel plus any DMs/groups you're in) and a live thread. Messages send/receive over a Socket.IO connection (`src/lib/socket.js`), not a page reload or polling - a message sent by anyone in the channel appears instantly for everyone else in it. "New DM" picks a teammate from a minimal name-only directory (`GET /api/chat/directory` - `/api/users` is admin-only) and finds-or-creates the DM channel |
| `/boards`, `/boards/:id` | Any role | **Whiteboard.** A list of shared canvases and a live collaborative drawing surface (embeds [tldraw](https://tldraw.dev)) - for architecture sketches, meeting notes, or creative briefs/storyboards. Every edit anyone makes on a board appears live for everyone else viewing it, over the same kind of Socket.IO connection chat uses (a separate `/board` namespace, `src/lib/socket.js`). The canvas code (`pages/BoardDetail.jsx`, tldraw itself) is lazy-loaded (`React.lazy`) so its ~1.7MB doesn't load until someone actually opens a board |
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

The chat and whiteboard Socket.IO connections (`src/lib/socket.js`) reuse
the same stored token, passed in the connection handshake rather than a
header (`auth: {token}`) - Socket.IO's client/server handshake doesn't
carry arbitrary HTTP headers the way `fetch` does. One shared connection
per tab per namespace, created lazily on first use; `AuthContext`'s
`logout()` disconnects both so a stale authenticated socket doesn't linger
past logout.

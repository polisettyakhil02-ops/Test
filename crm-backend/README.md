# Dominare CRM - Backend

Express + MongoDB API for the Dominare Tech internal CRM: leads/pipeline
(companies, contacts, deals), and developer task tracking loosely linked to
deals.

## Setup

```bash
cd crm-backend
npm install
cp .env.example .env   # adjust MONGODB_URI / JWT_SECRET for your setup
```

Needs a reachable MongoDB instance - either a local `mongod` (default
`.env.example` points at `mongodb://127.0.0.1:27017/dominare_crm`) or a
hosted connection string (e.g. MongoDB Atlas).

```bash
npm run seed   # creates an admin/sales/developer demo user + sample data
npm start      # http://localhost:4000
```

The seed script is idempotent: it upserts the admin user by
`SEED_ADMIN_EMAIL` and only creates the sample company/contact/deal/task once
(skipped on re-run if a deal already exists). It also creates two more demo
accounts so you can see role-based behavior:

| Role | Email | Password |
|---|---|---|
| admin | value of `SEED_ADMIN_EMAIL` (default `admin@dominaretech.com`) | value of `SEED_ADMIN_PASSWORD` |
| sales | `sales@dominaretech.com` | `changeme123` |
| developer | `dev@dominaretech.com` | `changeme123` |

Change these before seeding against anything but a throwaway local database.

```bash
npm test    # 51 unit tests: password hashing, JWT, role permissions, rate limiter, automation rule engine, weighted forecast, battle card matching, LinkedIn name parsing - no DB required
```

File attachments are written to `UPLOAD_DIR` (default `./uploads`, gitignored)
via `src/lib/storage.js` - a local-disk adapter with the same three-function
shape (`save`/`getPath`/`remove`) an S3-backed adapter would need, so moving
off single-process storage later doesn't touch anything above that layer.
Point `UPLOAD_DIR` at a persistent volume on any platform with an ephemeral
filesystem - a local disk won't survive a redeploy on most hosting platforms.

## API

All routes except `/health` and `POST /api/auth/login` require
`Authorization: Bearer <token>` (obtained from `/api/auth/login`).
`POST /api/auth/login` is rate-limited to 20 attempts/minute/IP. Live chat
message send/receive goes over a Socket.IO connection, not REST - see
**Real-time chat** below.

| Endpoint | Notes |
|---|---|
| `POST /api/auth/login` | `{ email, password }` -> `{ token, user }` |
| `GET /api/auth/me` | Current user |
| `PATCH /api/auth/me/password` | Self-service password change - `{ currentPassword, newPassword }` |
| `GET/POST/PATCH /api/users` | Admin only (reads included) - manage team accounts |
| `POST /api/leads/quick-parse` | Admin/sales. Stateless "Smart Drop Zone" - scrapes `websiteUrl` (OpenGraph tags) and/or regex-parses a name out of `linkedinUrl`, and matches a static battle card template. Doesn't touch the DB - see **Smart Drop Zone** below |
| `GET/POST/PUT/DELETE /api/leads` | Admin/sales only (reads included). Excludes archived unless `?archived=true`; filter by `?stage=`, `?ownerId=`. `DELETE` (permanent) is admin-only |
| `PATCH /api/leads/:id/stage` | Admin/sales. Moves the lead's own stage pipeline (`new`→`contacted`→`qualified`→`nurturing`/`disqualified`) - distinct from `Deal.STAGES`. Rejected once the lead has been converted |
| `PATCH /api/leads/:id/archive`, `/restore` | Same pattern as companies |
| `POST /api/leads/:id/convert` | Admin/sales. Creates (or reuses, matched by name/email) a Company + Contact, creates a `Deal` (`stage:'new'`), stamps `convertedToDealId`/`convertedAt` on the lead and archives it. **Not transactional** - see **Leads & conversion** below |
| `GET/POST/PUT/DELETE /api/companies` | Admin/sales only (reads included) - developers get `403`. Excludes archived unless `?archived=true`. `DELETE` (permanent) is admin-only |
| `PATCH /api/companies/:id/archive`, `/restore` | Soft delete/undelete - admin/sales |
| `GET/POST/PUT/DELETE /api/contacts` | Same access pattern as companies; filter by `?companyId=`; rejects a duplicate email with `409` |
| `PATCH /api/contacts/:id/archive`, `/restore` | Same pattern as companies |
| `GET/POST/PUT/DELETE /api/deals` | Same access pattern as companies; filter by `?stage=`, `?ownerId=`, `?companyId=`. `PATCH /:id/stage` moves the pipeline stage, logs an activity (optionally with a `reason` when moving to `lost`), and notifies the deal owner if someone else moved it |
| `GET /api/deals/conflicts?companyId=` | Admin/sales only. Deal registration check: open (non-won/lost, non-archived) deals already on that company, with owner and last activity - the "is someone already working this account" check before registering a new deal |
| `PATCH /api/deals/:id/archive`, `/restore` | Same pattern as companies |
| `GET/POST/PUT/DELETE /api/tasks` | Reads: any role - a developer's own tasks come back with `dealId` populated to `{ title, companyId: { name } }`, `leadId` populated to `{ name, companyName }`, and `projectId` populated to `{ name, kind }`, so they can see what a task is for without needing direct access to `/api/deals`, `/api/companies`, `/api/leads`, or (for developers, moot - `/api/projects` is open to every role anyway). Create/edit (including reassigning `assigneeId` on an existing task, and setting `dealId`/`leadId`/`projectId`/bug fields): admin/sales, and notifies the (re)assignee. `PATCH /:id/status` also allowed by the assigned developer. Filter by `?assigneeId=`, `?dealId=`, `?leadId=`, `?projectId=`, `?status=`, `?issueType=`, `?unassigned=true`, `?mine=true`. `PUT` only touches fields actually present in the request body - a partial update (e.g. the board's reassign action, which sends just `{assigneeId}`) never clobbers an omitted field to `null` |
| `PATCH /api/tasks/:id/claim` | Any role. Self-assign an *unassigned* task - the one reassignment a developer can do without admin/sales, so the Developer Dashboard's cross-project Backlog is actually actionable by the people triaging it. `409` if the task already has an assignee |
| `POST /api/tasks/:id/subtasks` | Add a checklist item - same permission as `PATCH /:id/status` (admin/sales, or the assignee) |
| `PATCH /api/tasks/:id/subtasks/:subtaskId` | Toggle `done` and/or rename a subtask |
| `DELETE /api/tasks/:id/subtasks/:subtaskId` | Remove a subtask |
| `POST /api/tasks/:id/snippets` | Add a code snippet (`label`, `language`, `code`) - same permission as subtasks |
| `DELETE /api/tasks/:id/snippets/:snippetId` | Remove a code snippet |
| `GET/POST/PUT /api/projects` | Any role (reads included) - projects are the shared dev/creative workspace, not client data. Excludes archived unless `?archived=true` |
| `PATCH /api/projects/:id/scratchpad` | Any role. Replaces the project's free-form notes/snippets dump - separate from the general `PUT` so a quick note doesn't need a full edit |
| `PATCH /api/projects/:id/archive`, `/restore` | Same pattern as companies |
| `GET/POST /api/activities` | Notes/calls/emails/meetings/stage changes/comments, scoped to `?dealId=`, `?contactId=`, `?leadId=`, or `?taskId=`. `dealId`/`contactId`/`leadId` activities are admin/sales only (same restriction as the records themselves); `taskId` activities (a task's comment thread) are open to any role, same as the task |
| `GET /api/dashboard` | Role-scoped. Admin/sales: deals by stage + total/weighted value, win rate, weighted forecast, tasks by status/assignee, overdue task count, recent activity feed, plus the "Smart Analysis" additions - `actionItems`, `stageVelocity`, `funnel` - see **Smart Analysis dashboard** below. Developer: their own tasks only - by status, overdue count, task list - no pipeline value, win rate, or any of the pipeline-derived smart-analysis data |
| `GET /api/search?q=` | Admin/sales only - it only searches companies/contacts/deals, all of which are already admin/sales-only. Case-insensitive name/title match, up to 6 results each, archived records excluded |
| `GET /api/notifications` | Current user's notifications (newest first) + unread count |
| `PATCH /api/notifications/:id/read`, `/read-all` | Mark one or all notifications read |
| `GET/POST /api/attachments` | List (`?entityType=&entityId=`) or upload (multipart, field `file`) a file against a task, deal, or contact. Deal/contact attachments are admin/sales only; task attachments are open to any role. Wired into the frontend's Deal and Contact detail pages as well as Task detail |
| `GET /api/attachments/:id/download` | Streams the file |
| `DELETE /api/attachments/:id` | The uploader, or admin/sales |
| `GET /api/audit-log?entityType=&entityId=&limit=` | Admin only. Who did what, when - created/updated/archived/restored/deleted/stage_changed/status_changed/reassigned - across companies, contacts, deals, and tasks |
| `GET/POST/PATCH/DELETE /api/rules` | Admin only. Manage automation rules - see **Automation** below. `GET` also returns `eventTypes`/`actionTypes`/`conditionOps` so the frontend form doesn't hardcode them |
| `GET /api/chat/directory` | Any role. Minimal `{name, role}`-only user list for starting a DM - `/api/users` is admin-only, this exists so a non-admin can still see who's on the team |
| `GET/POST /api/chat/channels` | Any role. List channels you belong to (`team` channels are implicitly everyone's); create a named `group` channel |
| `POST /api/chat/channels/direct` | Any role. Find-or-create a DM (2 members) or group-DM (3+), keyed by the exact member set so re-requesting the same pair returns the same channel |
| `GET /api/chat/channels/:id/messages` | Any role, membership required. Paginated history, newest-first internally but returned oldest-first; `?before=<messageId>&limit=` |
| `GET/POST/PATCH /api/boards` | Any role. List/create/rename whiteboards; `PATCH` only touches `title`/`linkedEntityType`/`linkedEntityId` - the live canvas (`sceneData`) is written by the realtime layer's debounced save, never this route, so a REST edit can't race a canvas edit on the same document. See **Real-time chat** above for the shared realtime wiring and **Whiteboard** below for the `/board` namespace specifics |

## Roles & permissions

See `src/lib/permissions.js` (unit tested in `test/permissions.test.js`) for
the source of truth. Summary:

- **admin**: full access to everything, including user management.
- **sales**: full CRUD on leads/companies/contacts/deals/activities/tasks; no user management.
- **developer**: no access to leads, companies, contacts, the pipeline, or
  the user directory (`GET` included - this is enforced on the backend, not
  just hidden in the UI). Can only update the status of tasks assigned to
  them (and subtasks/attachments on them), and comment on any task's thread.
  Sees which client, lead, or project a task belongs to through the task
  itself (`dealId` populated with the deal title and company name, `leadId`
  with the lead name and company, or `projectId` with the project name and
  kind), not by browsing the client database. Full read/write on `/api/projects`
  (it isn't client data), plus the one narrow exception to "can't reassign":
  `PATCH /api/tasks/:id/claim` to self-assign an unassigned task.

Companies/contacts/deals aren't visible to every role by default - only
admin and sales have any reason to see client data or deal values. Task and
activity records stay readable by any authenticated role, since that's the
information a developer actually needs day to day. There's still no
per-record ownership restriction *within* a role (e.g. one sales rep can see
another's deals) - deliberately simple for a 2-10 person trusted team, but
worth revisiting if the team grows.

## Data model

- **Lead** is a distinct pre-sales object with its own stage pipeline
  (`new` -> `contacted` -> `qualified` -> `nurturing`/`disqualified`,
  `Lead.STAGES` - separate from `Deal.STAGES`) and enrichment fields
  (`companyName`/`companyWebsite`, `contactName`/`contactEmail`/`contactPhone`,
  `linkedinUrl`, `source`, plus `enrichment`/`battleCard` - see **Smart Drop
  Zone** below). `POST /api/leads/:id/convert` graduates it into a
  real `Company`/`Contact`/`Deal` - see **Leads & conversion** below.
- **Deal** stays the unified pipeline object once a lead converts (or when
  created directly, bypassing the lead stage entirely) - `stage` starts at
  `new` and moves through `contacted` -> `qualified` -> `proposal` ->
  `won`/`lost`.
- **Task** has *optional* `dealId`, `leadId`, and `projectId` fields - the
  "loose link" to developer work: a task can reference a client/deal, a
  pre-sales lead, a project (internal build or brand campaign), or stand
  alone as ad-hoc work. Convention (not a schema constraint) is that a task
  uses at most one of the three. Task also carries an `issueType`
  (`'feature'`|`'bug'`|`'tech_debt'`, default `'feature'` - renamed from a
  plain `type: 'task'|'bug'` once tasks needed to live on a Project board
  alongside tech-debt work, not just features and bugs) plus bug-only
  fields (`severity`, `stepsToReproduce`, `expectedBehavior`,
  `actualBehavior`, `environment`, `relatedTaskId`) - see **Bug tracking**
  below.
- **Project** is the developer/creative workspace object - `name`,
  `description`, `kind` (`'internal'`|`'campaign'`, e.g. an internal build
  vs. a brand campaign like Finale), a free-form `scratchpad` string for
  notes/snippets that don't belong to any one task yet, and `archived`
  (same soft-delete pattern as companies/contacts/deals). Unlike those,
  every route is open to any authenticated role - see **Developer
  Dashboard** below.
- **Company/Contact/Deal** have an `archived` flag rather than being hard-deleted
  by default - list endpoints exclude archived records unless `?archived=true`.
  Permanent `DELETE` still exists but is admin-only.
- **Notification** is created by the automation engine (see below), not
  hardcoded route logic. `type` includes `'automation'` for rule-generated
  notifications, alongside the older `'task_assigned'`/`'deal_stage_changed'`
  values. Read by the recipient via `GET /api/notifications`.
- **Task.subtasks** is an embedded array (`{ title, done }`), not a separate
  collection - a checklist belongs to exactly one task and is never queried
  on its own.
- **Task.codeSnippets** is the same pattern - an embedded array
  (`{ label, language, code, addedBy }`) for pasting a code fragment or
  stack trace onto a task or bug, shown in `TaskDetail.jsx` alongside
  subtasks/attachments/comments.
- **Activity** attaches to a `taskId`, `dealId`, `contactId`, or `leadId` -
  a task's comment thread reuses the same model, feed, and API shape as
  deal/contact/lead notes instead of being a separate system.
- **Contact** has a `linkedinUrl` field alongside the existing `phone`.
- **ChatChannel** (`type`: `team`/`group`/`dm`) and **ChatMessage** back
  real-time chat - see **Real-time chat and whiteboard** below. `team`
  channels don't need every user backfilled into `memberIds`;
  `group`/`dm` channels do.
- **Board** holds a whiteboard's live canvas state (`sceneData`, a tldraw
  snapshot) plus title/optional entity link; **BoardVersion** is a
  periodic (not per-stroke) history snapshot - see **Whiteboard** below.
- **Attachment** is generic (`entityType` + `entityId`) so the same model and
  routes serve tasks, deals, and contacts.
- **AuditLog** is a flat, append-only record of who did what and when
  (`action` + a small `changes` diff, not a full before/after snapshot) -
  wired into create/update/archive/restore/delete on companies, contacts,
  deals, leads (plus `stage_changed`/`converted` on leads), and projects,
  create/update/reassign/status-change/delete on tasks, and
  create/update/enable/disable/delete on automation rules. Viewable at
  `GET /api/audit-log` (admin only).
- **Rule** defines an automation: a `trigger` (an event name plus an
  optional list of `{ field, op, value }` conditions, all of which must
  match) and one or more `actions` (`notify` or `create_task`, each with a
  `params` object - see below).

## Automation

Events that used to trigger hardcoded notification logic directly in the
route handlers (`deal.created`, `deal.stage_changed`, `task.created`,
`task.assigned`, `task.status_changed`, plus `lead.created` and
`lead.converted`) now go through a small event/rule engine instead, so an
admin can add, disable, or retarget behavior from
`GET/POST/PATCH/DELETE /api/rules` without a code change:

- `src/lib/ruleEngine.js` is pure, DB-free logic - condition matching
  (`matchesConditions`) and `{{field}}` template substitution
  (`renderTemplate`) against a plain entity object. Unit tested in
  `test/ruleEngine.test.js` with no database involved.
- `src/lib/events.js` is the DB-touching half: `emitEvent(event, entity,
  context)` loads enabled rules for that event, checks each rule's
  conditions against the entity, and runs its actions. A rule action
  failing (or the whole rule-load query failing) is caught and logged,
  never thrown back into the route that emitted the event - automation is
  best-effort, it must never block the underlying create/update.
- Routes call `emitEvent` right after the fact happens (e.g.
  `deals.js`'s stage-change route emits `deal.stage_changed` with a
  `previousStage` field spliced onto the deal object purely so a rule's
  message/condition can reference `{{previousStage}}` - it isn't a real
  field on the Deal model).
- `notify` actions read a target user id off the entity (via
  `action.params.targetField`, e.g. `"ownerId"`) and skip silently if
  that field is empty or resolves to the user who caused the event
  (no self-notifications). `create_task` actions create a `Task`,
  optionally assigning it (`assigneeField`) and linking it to the
  triggering deal (`linkToDeal: true`).
- `npm run seed` creates 3 default rules replicating what used to be
  built-in behavior (notify on task assignment, notify the deal owner on
  stage change) plus one new example (auto-create a delivery kickoff task
  when a deal reaches `won`) - seeding is idempotent, skipped if any rule
  already exists.

## Bug tracking

Bugs are **not** a separate model or collection - they're a `Task` with
`issueType: 'bug'` plus a handful of bug-only fields (`severity`,
`stepsToReproduce`, `expectedBehavior`, `actualBehavior`, `environment`,
and `relatedTaskId` for "found while working on this other task"). A true
Mongoose discriminator (a separate `Bug` model sharing Task's collection)
was considered and rejected: bugs and tasks share the entire lifecycle -
status board, assignee, subtasks, attachments, comment thread, dashboard
aggregation, and every automation event - so splitting the model would mean
either duplicating all of that machinery or threading discriminator-aware
code through it for no real gain at this scale. A flat optional-fields
extension (the same pattern already used for `dealId`/`leadId`/`projectId`)
gets the same practical outcome - one board, one detail page, one set of
routes - with far less code.

`issueType` started as a plain `type: 'task'|'bug'` boolean-ish flag; it
widened to `'feature'|'bug'|'tech_debt'` once tasks needed to live on a
Project's Kanban board next to tech-debt work that isn't really "just a
task" either. There's deliberately no separate `tech_debt`-only field set -
it reuses the same lifecycle as a feature, no bug-specific fields shown.

One free side effect: because the automation engine's rule matching
(`src/lib/ruleEngine.js`) works against *any* field name on the triggering
entity, an admin can already write a rule like "on `task.created`, if
`severity` equals `critical`, notify the team lead" from the existing
`/rules` UI - no engine change was needed to support severity-based
automation.

## Developer Dashboard

`Project` is the "Developer Creative Space" - a lightweight grouping object
for work that isn't tied to a client deal: internal builds/tooling, or a
brand campaign (e.g. Finale) with its own creative brief. Every route is
open to any authenticated role rather than admin/sales-gated like
companies/deals, since this is the team's shared workspace, not client
data - a developer can create a project, edit its scratchpad, and read the
board; only task *creation* and *reassignment* (beyond self-claiming, see
below) stay admin/sales-only, unchanged from the rest of the app.

- **Scratchpad** (`Project.scratchpad`) is a single free-form text field,
  not a structured note list - explicitly for dumping code fragments or
  half-formed ideas before they're worth turning into a task, same spirit
  as `Task.codeSnippets` but at the project level and without the
  label/language structure (there's nowhere to hang that metadata for a
  loose scratchpad, and forcing it would just get in the way).
- **Backlog** is *not* scoped to the selected project - `GET
  /api/tasks?issueType=bug&unassigned=true` returns unassigned bugs across
  every project, because triage happens before ownership, not per-project.
  The Kanban board below it *is* project-scoped (`?projectId=`), since
  that's "what am I actively working on."
- **Claiming**: a developer can't reassign tasks in general (`PUT
  /api/tasks/:id` stays admin/sales-only), but the Backlog is useless to
  them if they can't act on it. `PATCH /api/tasks/:id/claim` is a
  deliberately narrow exception - it only ever sets `assigneeId` to the
  caller, and only while the task is still unassigned - rather than
  broadening the general reassignment permission.

## Smart Drop Zone (non-AI lead enrichment)

`POST /api/leads/quick-parse` is the backend for the frontend's drag-and-drop
"Smart drop zone" on the New Lead form. It's deliberately **not** AI/LLM
based - three small, predictable pieces:

- **OpenGraph scrape** (`open-graph-scraper`) of `websiteUrl` for company
  name/description/logo. A blocked or unreachable site doesn't fail the
  whole request - it comes back as `enrichmentError`, and any LinkedIn
  result still returns.
- **LinkedIn name parsing** (`src/lib/linkedin.js`, pure, unit tested) -
  regexes the profile slug out of `linkedinUrl` and title-cases it, stripping
  a trailing hex/digit id segment LinkedIn often appends
  (`jordan-lee-4a2b1c9` -> "Jordan Lee"). Best-effort only; it only ever sees
  what's in the URL.
- **Battle card matching** (`src/lib/battleCards.js`, pure, unit tested) -
  a small static table of `{ industry, keywords, questions, talkingPoints }`
  templates (SaaS, retail, manufacturing). The scraped description is scored
  against each template's keyword list; the highest-scoring template is
  returned (or `null` if nothing matched). Editing the discovery questions
  for an industry is a one-file change, no redeploy of any AI prompt or
  model needed.

The route itself never touches the database - it returns suggested field
values for the frontend's New Lead form to prefill, and the rep can edit
everything before the real `POST /api/leads` (which now also accepts
`enrichment`/`battleCard` in its body) actually creates anything. Re-running
a parse costs nothing and leaves no partial records behind.

## Real-time chat and whiteboard

`src/realtime/index.js` attaches Socket.IO to the **same HTTP server**
Express listens on (`src/index.js`) - no second port or process to deploy.
It exposes two namespaces, `/chat` (below) and `/board` (see **Whiteboard**
further down), sharing one JWT handshake auth middleware. The bottleneck
risk with adding realtime to an existing API isn't "two servers competing,"
it's a socket handler doing synchronous CPU work on the single event loop
and stalling every other request, REST or WebSocket, until it finishes. The
mitigation here is entirely about what's *inside* each handler: every one
does only awaited async I/O (a Mongo call), never a synchronous loop over a
large payload.

- **Auth**: the `/chat` namespace's connection middleware verifies the JWT
  passed in the Socket.IO handshake (`socket.handshake.auth.token`) using
  the exact same `verifyToken`/`sub` mapping `middleware/auth.js` uses for
  REST - a bad or missing token gets `connect_error`, never a connection.
- **Rooms**: one room per channel (`chat:<channelId>`); `channel:join`
  checks membership (`team` channels are open to everyone; `group`/`dm`
  channels check `memberIds`) before joining.
- **`message:send`**: persists the `ChatMessage` first, *then* broadcasts
  `message:new` to the room - write-through, so a message is never visible
  to a peer and then lost if something crashes right after. The author is
  populated (`name` only) before broadcasting so the frontend doesn't need
  a second round-trip to resolve who sent it.
- **`typing`**: relayed to the room only, never persisted - ephemeral by
  design.
- Every ack/emit acknowledges success/failure back to the sender
  (`{ok: true}` / `{ok: false, error}`), so the frontend can surface a
  failed send instead of it silently vanishing.

No new datastore was added for this - MongoDB handles chat history fine at
this team's scale. If this ever needs more than one server instance,
Socket.IO's rooms need a shared adapter (e.g. Redis) to broadcast across
processes - not needed now, worth remembering if that changes.

## Whiteboard

A shared canvas (`Board` + periodic `BoardVersion` safety-net snapshots) for
live drawing, meeting notes, architecture sketches, or creative
briefs/storyboards - the frontend embeds `tldraw`. Any authenticated team
member can join and edit any board (boards aren't access-controlled beyond
authentication, same as chat's `team` channel - this is an internal tool,
not a client-facing one).

- **`board:join`** - joins the Socket.IO room for that board (`board:<id>`);
  no membership check, any authenticated user.
- **`scene:update`** - the client emits its current canvas snapshot
  (throttled client-side, ~400ms) whenever the user draws something. The
  server relays it to every *other* client in the room (the sender never
  gets its own update echoed back), and separately schedules a **debounced
  persist**: 3 seconds after the last update for that board, the current
  scene is written to `Board.sceneData`. A `BoardVersion` snapshot is only
  captured if more than 5 minutes have passed since the last one for that
  board - a safety net, not a full undo history, and never on every stroke.
- This is a **simple relay-and-last-write-wins sync, not a CRDT merge** -
  the honest trade-off of building this on the same lightweight pattern
  chat uses instead of adopting tldraw's own dedicated multiplayer sync
  package. Fine for a small team where two people rarely draw the exact
  same spot at the exact same moment; if genuine fine-grained concurrent
  editing conflict resolution becomes a real problem, that's the point to
  evaluate `@tldraw/sync` instead of this hand-rolled relay.
- The debounce/snapshot-interval state (`boardSaveTimers`,
  `boardLastSnapshotAt` in `src/realtime/index.js`) is in-process memory -
  fine at this team's scale, same caveat as Socket.IO's own room broadcast
  needing a shared adapter (e.g. Redis) if this ever runs on more than one
  server instance.
- tldraw fetches its default fonts/icons/translations from
  `cdn.tldraw.com` at runtime. A normal internet-connected deployment never
  notices; a fully offline/intranet deployment would need to self-host
  those static assets and pass `assetUrls` to the `<Tldraw>` component -
  not done here, since it's not needed for a normal deployment.

## Leads & conversion

Leads are deliberately a separate model from Deal, not another Deal stage -
they carry pre-sales-only fields (LinkedIn, free-text company info before a
real Company record exists) and their own stage pipeline (`Lead.STAGES`).
`POST /api/leads/:id/convert`:

1. Resolves a `Company` - reuses one matching `companyName` case-insensitively,
   or creates one from `companyName`/`companyWebsite` if none matches.
2. Resolves a `Contact` the same way, matched by `contactEmail`.
3. Creates a `Deal` (`stage: 'new'`) linked to that company/contact.
4. Stamps `convertedToDealId`/`convertedAt` on the Lead and archives it (a
   converted lead never re-enters the stage pipeline).
5. Logs an Activity on the new deal noting which lead it came from, and
   audit-logs both the lead's `converted` action and the deal's `created`
   action.
6. Emits `lead.converted` (and `deal.created`) through the automation engine,
   so a rule can, e.g., notify the deal owner when a lead they were nurturing
   converts.

This is **not wrapped in a MongoDB transaction** - transactions need a
replica set, and requiring one just for this endpoint would complicate local
dev setup (the documented `MONGODB_URI` is a standalone `mongod`). If a step
fails partway through, earlier-created records are not rolled back; the
error is returned to the caller, and re-running the conversion is safe
(the company/contact lookups are idempotent `findOne`-before-`create`
checks, and the endpoint itself refuses to run twice on an already-converted
lead).

## Forecasting

`src/lib/forecast.js` is pure, DB-free logic (unit tested in
`test/forecast.test.js`) that turns raw pipeline value into a weighted
forecast using a fixed stage-probability table (`new` 10%, `contacted` 25%,
`qualified` 50%, `proposal` 75%, `won` 100%, `lost` 0%) - a $100k deal sitting
in `proposal` counts for $75k of forecasted revenue, not the full $100k,
since it hasn't closed yet. `GET /api/dashboard`'s `dealsByStage` now
includes a `weightedValue` per stage alongside `totalValue`, and the
top-level `weightedForecast` sums the weighted value of *open* stages only
(`won` is excluded since that revenue is already realized; `lost` is
excluded since its weight is 0 anyway). Archived deals are excluded from
`dealsByStage` entirely, matching how every other deal-listing endpoint
already treats them.

## Smart Analysis dashboard

The admin/sales dashboard moved from flat descriptive tables ("here's every
deal count") to three actionable views, all computed in a single
`GET /api/dashboard` call. The interesting logic - severity thresholds,
sorting, how three independent Mongo queries merge into one feed - is pure,
DB-free code in `src/lib/dashboardInsights.js` (unit tested in
`test/dashboardInsights.test.js`); the route (`src/routes/dashboard.js`) only
runs the aggregations and hands the raw rows to it.

**Action Center** (`actionItems`) merges three queries into one red/yellow
feed:
- *Rotting deals* - an open-stage deal whose newest `Activity` (or, if it has
  none, its own `createdAt`) is older than 7 days. A `$lookup` sub-pipeline
  pulls just the single newest activity per deal (sorted + `$limit: 1`), not
  the whole history. 7-13 days is yellow, 14+ is red.
- *Deals with no next step* - an open-stage deal with no non-`done` `Task`
  pointing at it (`$lookup` sub-pipeline stops at the first match). Always
  yellow - it's a process gap, not yet urgent.
- *Overdue developer blockers* - a `high`/`critical` severity bug (`Task`
  with `issueType: 'bug'`), past its `dueDate`, not `done`. `critical` is
  red, `high` is yellow.

Each source's Mongo `$sort` establishes worst-first order within its own
results; `buildActionItems` then interleaves all three with red always
ahead of yellow, and normalizes them into `{ id, category, severity, title,
detail, link }` so the frontend maps over one shape without knowing which
query an item came from.

**Pipeline velocity** (`stageVelocity`) is average days spent in a stage
*before leaving it* - not a naive read of `Deal.updatedAt` (which only ever
reflects the most recent change, so it can't say how long a deal sat in
`contacted` before that). It's computed from `AuditLog`'s `stage_changed`
history instead: a `$setWindowFields`/`$shift` pipeline (**requires MongoDB
5.0+**) pulls each audit entry's *previous* entry within the same deal
(partitioned by `entityId`, sorted by `createdAt`); the gap between them is
how long the deal sat in the stage it just left. A deal's first transition
has no previous entry, so it falls back to the deal's own `createdAt`.
`won`/`lost` are terminal - deals never leave them - so they never get a
sample and report `avgDays: null` ("not enough data yet"), which is a
different, real answer from `0`.

**Pipeline funnel** (`funnel`) is how many deals have *ever reached* each
stage, not how many are sitting there right now (which would undercount
every stage a deal has since moved past). "Reached" is the union of two
sources: `AuditLog` entries transitioning *into* a stage, and deals
*currently* there (covering deals that have never moved, which never
produced an audit entry at all). `new` is special-cased to the total
non-archived deal count, since every deal starts there by schema default -
audit-log-only counting would silently miss it, as there's no "from" stage
on a deal's very first transition. `lost` is deliberately **not** a funnel
stage: a deal can be lost from any open stage, so treating it as "the stage
after proposal" would imply an ordering that doesn't exist. It's reported
separately as `funnel.lostCount`/`funnel.lostRate` instead.

## Before exposing this to real users

- Set a strong, random `JWT_SECRET` - the `.env.example` default is for local
  dev only.
- Restrict `CORS_ORIGIN` to your actual frontend's URL.
- Put this behind HTTPS.
- There's self-service password *change* (`PATCH /api/auth/me/password`) but
  no forgot-password/email-reset flow, and no self-service signup - admins
  create accounts via `POST /api/users`. Add a reset flow once locked-out
  users can't just ask an admin directly.
- The dashboard's stage-velocity aggregation uses `$setWindowFields`/`$shift`,
  which needs **MongoDB 5.0+** - confirm your deployment target before
  relying on it. It was verified against the sandbox this was built in only
  via unit tests on the pure-logic layer and an HTTP boot test (auth/role
  gating, no thrown errors reaching the DB call); there was no live MongoDB
  available to run the actual aggregation end-to-end. Run it against a real
  seeded database before shipping.

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
npm test    # 36 unit tests: password hashing, JWT, role permissions, rate limiter, automation rule engine, weighted forecast - no DB required
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
`POST /api/auth/login` is rate-limited to 20 attempts/minute/IP.

| Endpoint | Notes |
|---|---|
| `POST /api/auth/login` | `{ email, password }` -> `{ token, user }` |
| `GET /api/auth/me` | Current user |
| `PATCH /api/auth/me/password` | Self-service password change - `{ currentPassword, newPassword }` |
| `GET/POST/PATCH /api/users` | Admin only (reads included) - manage team accounts |
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
| `GET/POST/PUT/DELETE /api/tasks` | Reads: any role - a developer's own tasks come back with `dealId` populated to `{ title, companyId: { name } }` and `leadId` populated to `{ name, companyName }`, so they can see which client (or lead) a task is for without needing direct access to `/api/deals`, `/api/companies`, or `/api/leads`. Create/edit (including reassigning `assigneeId` on an existing task, and setting `dealId`/`leadId`): admin/sales, and notifies the (re)assignee. `PATCH /:id/status` also allowed by the assigned developer. Filter by `?assigneeId=`, `?dealId=`, `?leadId=`, `?status=`, `?mine=true` |
| `POST /api/tasks/:id/subtasks` | Add a checklist item - same permission as `PATCH /:id/status` (admin/sales, or the assignee) |
| `PATCH /api/tasks/:id/subtasks/:subtaskId` | Toggle `done` and/or rename a subtask |
| `DELETE /api/tasks/:id/subtasks/:subtaskId` | Remove a subtask |
| `GET/POST /api/activities` | Notes/calls/emails/meetings/stage changes/comments, scoped to `?dealId=`, `?contactId=`, `?leadId=`, or `?taskId=`. `dealId`/`contactId`/`leadId` activities are admin/sales only (same restriction as the records themselves); `taskId` activities (a task's comment thread) are open to any role, same as the task |
| `GET /api/dashboard` | Role-scoped. Admin/sales: deals by stage + total/weighted value, win rate, weighted forecast, tasks by status/assignee, overdue task count, recent activity feed. Developer: their own tasks only - by status, overdue count, task list - no pipeline value or win rate |
| `GET /api/search?q=` | Admin/sales only - it only searches companies/contacts/deals, all of which are already admin/sales-only. Case-insensitive name/title match, up to 6 results each, archived records excluded |
| `GET /api/notifications` | Current user's notifications (newest first) + unread count |
| `PATCH /api/notifications/:id/read`, `/read-all` | Mark one or all notifications read |
| `GET/POST /api/attachments` | List (`?entityType=&entityId=`) or upload (multipart, field `file`) a file against a task, deal, or contact. Deal/contact attachments are admin/sales only; task attachments are open to any role. Wired into the frontend's Deal and Contact detail pages as well as Task detail |
| `GET /api/attachments/:id/download` | Streams the file |
| `DELETE /api/attachments/:id` | The uploader, or admin/sales |
| `GET /api/audit-log?entityType=&entityId=&limit=` | Admin only. Who did what, when - created/updated/archived/restored/deleted/stage_changed/status_changed/reassigned - across companies, contacts, deals, and tasks |
| `GET/POST/PATCH/DELETE /api/rules` | Admin only. Manage automation rules - see **Automation** below. `GET` also returns `eventTypes`/`actionTypes`/`conditionOps` so the frontend form doesn't hardcode them |

## Roles & permissions

See `src/lib/permissions.js` (unit tested in `test/permissions.test.js`) for
the source of truth. Summary:

- **admin**: full access to everything, including user management.
- **sales**: full CRUD on leads/companies/contacts/deals/activities/tasks; no user management.
- **developer**: no access to leads, companies, contacts, the pipeline, or
  the user directory (`GET` included - this is enforced on the backend, not
  just hidden in the UI). Can only update the status of tasks assigned to
  them (and subtasks/attachments on them), and comment on any task's thread.
  Sees which client or lead a task belongs to through the task itself
  (`dealId` populated with the deal title and company name, or `leadId`
  populated with the lead name and company), not by browsing the client
  database.

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
  `linkedinUrl`, `source`). `POST /api/leads/:id/convert` graduates it into a
  real `Company`/`Contact`/`Deal` - see **Leads & conversion** below.
- **Deal** stays the unified pipeline object once a lead converts (or when
  created directly, bypassing the lead stage entirely) - `stage` starts at
  `new` and moves through `contacted` -> `qualified` -> `proposal` ->
  `won`/`lost`.
- **Task** has *optional* `dealId` and `leadId` fields - the "loose link" to
  developer work: a task can reference a client/deal, a pre-sales lead, or
  stand alone as internal work. Convention (not a schema constraint) is that
  a task uses at most one of the two.
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
- **Activity** attaches to a `taskId`, `dealId`, `contactId`, or `leadId` -
  a task's comment thread reuses the same model, feed, and API shape as
  deal/contact/lead notes instead of being a separate system.
- **Contact** has a `linkedinUrl` field alongside the existing `phone`.
- **Attachment** is generic (`entityType` + `entityId`) so the same model and
  routes serve tasks, deals, and contacts.
- **AuditLog** is a flat, append-only record of who did what and when
  (`action` + a small `changes` diff, not a full before/after snapshot) -
  wired into create/update/archive/restore/delete on companies, contacts,
  deals, and leads (plus `stage_changed`/`converted` on leads), create/update
  /reassign/status-change/delete on tasks, and create/update/enable/disable
  /delete on automation rules. Viewable at `GET /api/audit-log` (admin only).
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

## Before exposing this to real users

- Set a strong, random `JWT_SECRET` - the `.env.example` default is for local
  dev only.
- Restrict `CORS_ORIGIN` to your actual frontend's URL.
- Put this behind HTTPS.
- There's self-service password *change* (`PATCH /api/auth/me/password`) but
  no forgot-password/email-reset flow, and no self-service signup - admins
  create accounts via `POST /api/users`. Add a reset flow once locked-out
  users can't just ask an admin directly.

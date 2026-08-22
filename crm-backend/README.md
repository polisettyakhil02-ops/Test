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
npm test    # 18 unit tests: password hashing, JWT, role permissions, rate limiter - no DB required
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
| `GET/POST/PUT/DELETE /api/companies` | Admin/sales only (reads included) - developers get `403`. Excludes archived unless `?archived=true`. `DELETE` (permanent) is admin-only |
| `PATCH /api/companies/:id/archive`, `/restore` | Soft delete/undelete - admin/sales |
| `GET/POST/PUT/DELETE /api/contacts` | Same access pattern as companies; filter by `?companyId=`; rejects a duplicate email with `409` |
| `PATCH /api/contacts/:id/archive`, `/restore` | Same pattern as companies |
| `GET/POST/PUT/DELETE /api/deals` | Same access pattern as companies; filter by `?stage=`, `?ownerId=`, `?companyId=`. `PATCH /:id/stage` moves the pipeline stage, logs an activity (optionally with a `reason` when moving to `lost`), and notifies the deal owner if someone else moved it |
| `GET /api/deals/conflicts?companyId=` | Admin/sales only. Deal registration check: open (non-won/lost, non-archived) deals already on that company, with owner and last activity - the "is someone already working this account" check before registering a new deal |
| `PATCH /api/deals/:id/archive`, `/restore` | Same pattern as companies |
| `GET/POST/PUT/DELETE /api/tasks` | Reads: any role - a developer's own tasks come back with `dealId` populated to `{ title, companyId: { name } }` so they can see which client a task is for without needing direct access to `/api/deals` or `/api/companies`. Create/edit (including reassigning `assigneeId` on an existing task): admin/sales, and notifies the (re)assignee. `PATCH /:id/status` also allowed by the assigned developer. Filter by `?assigneeId=`, `?dealId=`, `?status=`, `?mine=true` |
| `POST /api/tasks/:id/subtasks` | Add a checklist item - same permission as `PATCH /:id/status` (admin/sales, or the assignee) |
| `PATCH /api/tasks/:id/subtasks/:subtaskId` | Toggle `done` and/or rename a subtask |
| `DELETE /api/tasks/:id/subtasks/:subtaskId` | Remove a subtask |
| `GET/POST /api/activities` | Notes/calls/emails/meetings/stage changes/comments, scoped to `?dealId=`, `?contactId=`, or `?taskId=`. `dealId`/`contactId` activities are admin/sales only (same restriction as the records themselves); `taskId` activities (a task's comment thread) are open to any role, same as the task |
| `GET /api/dashboard` | Role-scoped. Admin/sales: deals by stage + total value, win rate, tasks by status/assignee, overdue task count, recent activity feed. Developer: their own tasks only - by status, overdue count, task list - no pipeline value or win rate |
| `GET /api/search?q=` | Admin/sales only - it only searches companies/contacts/deals, all of which are already admin/sales-only. Case-insensitive name/title match, up to 6 results each, archived records excluded |
| `GET /api/notifications` | Current user's notifications (newest first) + unread count |
| `PATCH /api/notifications/:id/read`, `/read-all` | Mark one or all notifications read |
| `GET/POST /api/attachments` | List (`?entityType=&entityId=`) or upload (multipart, field `file`) a file against a task, deal, or contact. Deal/contact attachments are admin/sales only; task attachments are open to any role |
| `GET /api/attachments/:id/download` | Streams the file |
| `DELETE /api/attachments/:id` | The uploader, or admin/sales |
| `GET /api/audit-log?entityType=&entityId=&limit=` | Admin only. Who did what, when - created/updated/archived/restored/deleted/stage_changed/status_changed/reassigned - across companies, contacts, deals, and tasks |

## Roles & permissions

See `src/lib/permissions.js` (unit tested in `test/permissions.test.js`) for
the source of truth. Summary:

- **admin**: full access to everything, including user management.
- **sales**: full CRUD on companies/contacts/deals/activities/tasks; no user management.
- **developer**: no access to companies, contacts, the pipeline, or the user
  directory (`GET` included - this is enforced on the backend, not just
  hidden in the UI). Can only update the status of tasks assigned to them
  (and subtasks/attachments on them), and comment on any task's thread.
  Sees which client a task belongs to through the task itself (`dealId`
  populated with the deal title and company name), not by browsing the
  client database.

Companies/contacts/deals aren't visible to every role by default - only
admin and sales have any reason to see client data or deal values. Task and
activity records stay readable by any authenticated role, since that's the
information a developer actually needs day to day. There's still no
per-record ownership restriction *within* a role (e.g. one sales rep can see
another's deals) - deliberately simple for a 2-10 person trusted team, but
worth revisiting if the team grows.

## Data model

- **Deal** unifies "lead" and "deal" into one pipeline object (`stage`
  starts at `new` and moves through `contacted` -> `qualified` -> `proposal`
  -> `won`/`lost`) rather than having separate Lead and Deal models.
- **Task** has an *optional* `dealId` - this is the "loose link" to developer
  work: a task can reference a client/deal, or stand alone as internal work.
- **Company/Contact/Deal** have an `archived` flag rather than being hard-deleted
  by default - list endpoints exclude archived records unless `?archived=true`.
  Permanent `DELETE` still exists but is admin-only.
- **Notification** is created on two events - a task being assigned, and a
  deal's stage changing when the mover isn't the deal's owner - and read by
  the recipient via `GET /api/notifications`.
- **Task.subtasks** is an embedded array (`{ title, done }`), not a separate
  collection - a checklist belongs to exactly one task and is never queried
  on its own.
- **Activity** now also attaches to a `taskId`, not just `dealId`/`contactId`
  - a task's comment thread reuses the same model, feed, and API shape as
    deal/contact notes instead of being a separate system.
- **Attachment** is generic (`entityType` + `entityId`) so the same model and
  routes serve tasks, deals, and contacts.
- **AuditLog** is a flat, append-only record of who did what and when
  (`action` + a small `changes` diff, not a full before/after snapshot) -
  wired into create/update/archive/restore/delete on companies, contacts,
  and deals, and create/update/reassign/status-change/delete on tasks.
  Viewable at `GET /api/audit-log` (admin only).

## Before exposing this to real users

- Set a strong, random `JWT_SECRET` - the `.env.example` default is for local
  dev only.
- Restrict `CORS_ORIGIN` to your actual frontend's URL.
- Put this behind HTTPS.
- There's self-service password *change* (`PATCH /api/auth/me/password`) but
  no forgot-password/email-reset flow, and no self-service signup - admins
  create accounts via `POST /api/users`. Add a reset flow once locked-out
  users can't just ask an admin directly.

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
npm test    # 16 unit tests: password hashing, JWT, role permissions, rate limiter - no DB required
```

## API

All routes except `/health` and `POST /api/auth/login` require
`Authorization: Bearer <token>` (obtained from `/api/auth/login`).
`POST /api/auth/login` is rate-limited to 20 attempts/minute/IP.

| Endpoint | Notes |
|---|---|
| `POST /api/auth/login` | `{ email, password }` -> `{ token, user }` |
| `GET /api/auth/me` | Current user |
| `PATCH /api/auth/me/password` | Self-service password change - `{ currentPassword, newPassword }` |
| `GET/POST/PATCH /api/users` | Admin only - manage team accounts |
| `GET/POST/PUT/DELETE /api/companies` | Reads: any role, excludes archived unless `?archived=true`. Writes: admin/sales. `DELETE` (permanent) is admin-only |
| `PATCH /api/companies/:id/archive`, `/restore` | Soft delete/undelete - admin/sales |
| `GET/POST/PUT/DELETE /api/contacts` | Same pattern as companies; filter by `?companyId=`; rejects a duplicate email with `409` |
| `PATCH /api/contacts/:id/archive`, `/restore` | Same pattern as companies |
| `GET/POST/PUT/DELETE /api/deals` | Same pattern as companies; filter by `?stage=`, `?ownerId=`, `?companyId=`. `PATCH /:id/stage` moves the pipeline stage, logs an activity (optionally with a `reason` when moving to `lost`), and notifies the deal owner if someone else moved it |
| `GET /api/deals/conflicts?companyId=` | Deal registration check: open (non-won/lost, non-archived) deals already on that company, with owner and last activity - the "is someone already working this account" check before registering a new deal |
| `PATCH /api/deals/:id/archive`, `/restore` | Same pattern as companies |
| `GET/POST/PUT/DELETE /api/tasks` | Reads: any role. Create/edit (including reassigning `assigneeId` on an existing task): admin/sales, and notifies the (re)assignee. `PATCH /:id/status` also allowed by the assigned developer. Filter by `?assigneeId=`, `?dealId=`, `?status=`, `?mine=true` |
| `GET/POST /api/activities` | Notes/calls/emails/meetings/stage changes, scoped to `?dealId=` or `?contactId=` |
| `GET /api/dashboard` | Role-scoped. Admin/sales: deals by stage + total value, win rate, tasks by status/assignee, overdue task count, recent activity feed. Developer: their own tasks only - by status, overdue count, task list - no pipeline value or win rate |
| `GET /api/search?q=` | Case-insensitive name/title match across companies, contacts (name+email), and deals - up to 6 results each, archived records excluded |
| `GET /api/notifications` | Current user's notifications (newest first) + unread count |
| `PATCH /api/notifications/:id/read`, `/read-all` | Mark one or all notifications read |

## Roles & permissions

See `src/lib/permissions.js` (unit tested in `test/permissions.test.js`) for
the source of truth. Summary:

- **admin**: full access to everything, including user management.
- **sales**: full CRUD on companies/contacts/deals/activities/tasks; no user management.
- **developer**: read-only on companies/contacts/deals; can only update the
  status of tasks assigned to them; can log activities.

All authenticated users can *view* every CRM resource - there's no per-record
ownership restriction in v1, since this is built for a small (2-10 person)
trusted internal team.

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

## Before exposing this to real users

- Set a strong, random `JWT_SECRET` - the `.env.example` default is for local
  dev only.
- Restrict `CORS_ORIGIN` to your actual frontend's URL.
- Put this behind HTTPS.
- There's self-service password *change* (`PATCH /api/auth/me/password`) but
  no forgot-password/email-reset flow, and no self-service signup - admins
  create accounts via `POST /api/users`. Add a reset flow once locked-out
  users can't just ask an admin directly.

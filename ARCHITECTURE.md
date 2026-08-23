# HIMS Platform — Architecture Blueprint (Steps 1-9)

A production-grade Hospital Information Management System living in this
repository alongside the pre-existing, unrelated "Ask the ERP" app
(`backend/`, `frontend/` — untouched). The HIMS platform is its own
top-level TypeScript/MERN system:

```
hims-backend/     Express + TypeScript API, MongoDB replica set, Redis
hims-frontend/    React (Vite/TS) client
docker/           Dockerfiles, Nginx config, docker-compose.prod.yml
DEPLOYMENT.md     Production hosting guide (root of the repo)
```

## Target full folder hierarchy

```
hims-backend/
├── src/
│   ├── config/
│   │   ├── env.ts              # zod-validated environment config       ✅ Step 1
│   │   ├── database.ts         # Mongo connection + withTransaction()   ✅ Step 1
│   │   └── redis.ts            # Redis client + key namespace           ✅ Step 1
│   ├── types/
│   │   └── common.types.ts     # shared enums/value objects, no deps    ✅ Step 1
│   ├── models/                 # Mongoose schemas, one file per entity  ✅ Step 1
│   │   ├── mpi/                # Patient Master Index
│   │   ├── opd/                # Doctor, DoctorSchedule, OPDQueue, OPDVisit
│   │   ├── ipd/                # Ward, Bed, Admission (ADT), DischargeSummary
│   │   ├── emr/                # ClinicalNote (SOAP), Diagnosis, Prescription, DrugAllergy
│   │   ├── nursing/             # VitalsLog, MedicationAdministration (MAR), ShiftHandover
│   │   ├── pharmacy/            # Drug, DrugBatch, Supplier, PurchaseOrder, StockTransaction, Dispensation
│   │   ├── lims/                # LabTest, LabOrder, Specimen, LabResult
│   │   ├── ot/                  # OTSchedule (OT + Cath Lab), SterilizationLog
│   │   ├── billing/             # TariffMaster, Invoice, Payment, InsurancePolicy, PreAuthorization
│   │   ├── admin/               # Department, Role, User, StaffProfile
│   │   ├── audit/               # AuditLog (immutable), RefreshToken
│   │   └── index.ts             # barrel export
│   ├── middlewares/                                                    ✅ Step 2 (partial)
│   │   ├── auth.middleware.ts   # authenticate/protect: HTTP-only cookie, Bearer fallback  ✅ Step 2
│   │   ├── rbac.middleware.ts   # authorizeRoles(...roles) + authorizePermission(resource, action), SUPER_ADMIN bypass  ✅ Step 2/3
│   │   ├── audit.interceptor.ts # auditInterceptor() (auto) + auditLogger(bucket) (explicit) writers  ✅ Step 2/3
│   │   └── errorHandler.ts      # maps AppError/ZodError/Mongoose errors/dup-key to HTTP responses  ✅ Step 3
│   ├── services/                                                       ✅ Step 2/3 (partial)
│   │   ├── pharmacy.service.ts  # PharmacyService.dispenseMedication — ACID stock deduction  ✅ Step 2
│   │   ├── adt.service.ts       # ADTService.admitPatient — ACID bed claim + admission  ✅ Step 2
│   │   ├── opd.service.ts       # OPDService.bookAppointment — ACID queue token + visit  ✅ Step 3
│   │   ├── emr.service.ts       # EMRService: clinical note+diagnoses, prescriptions, timeline  ✅ Step 3
│   │   ├── billing.service.ts   # BillingService.payInvoice — ACID payment + invoice update  ✅ Step 3
│   │   └── ...                  # auth/login/refresh, lab, OT services                  [Step 2/3 cont'd]
│   ├── repositories/                                                   [not yet needed]
│   │   └── ...                  # thin data-access layer wrapping models, if/when a domain needs it
│   ├── controllers/                                                    ✅ Step 3
│   │   ├── patient.controller.ts   # register, lookup by UHID, book appointment
│   │   ├── ipd.controller.ts       # admit, wards/beds visual map
│   │   ├── emr.controller.ts       # clinical notes, prescriptions, timeline
│   │   ├── pharmacy.controller.ts  # pending prescriptions, dispense
│   │   └── billing.controller.ts   # active invoice, pay invoice
│   ├── routes/                                                         ✅ Step 3
│   │   ├── index.ts             # mounts every domain router under /api
│   │   ├── patient.routes.ts    # /patients, /patients/:uhid, /appointments (see file header)
│   │   ├── ipd.routes.ts        # /ipd/admit, /ipd/wards
│   │   ├── emr.routes.ts        # /emr/:patientId/{notes,prescriptions,timeline}
│   │   ├── pharmacy.routes.ts   # /pharmacy/prescriptions/pending, /pharmacy/dispense
│   │   └── billing.routes.ts    # /billing/:patientId/active-invoice, /billing/:invoiceId/pay
│   ├── utils/                    # errors, objectId, money, sequenceGenerator, jwt, assert, validation  ✅ Step 2/3
│   ├── app.ts                   # createApp(): security middleware + /api mount + error handler  ✅ Step 3
│   └── server.ts               # bootstrap: connect DB, createApp(), listen             ✅ Step 1/3
├── test/
├── package.json                                                        ✅ Step 1
├── tsconfig.json                                                       ✅ Step 1
├── .env.example                                                        ✅ Step 1
└── README.md                                                           ✅ Step 1

hims-frontend/                                                          ✅ Step 4
├── src/
│   ├── types/                   # DTOs mirroring hims-backend/src/types, plus a few response-shape types  ✅ Step 4
│   ├── lib/                     # axios instance (+401/refresh interceptor), tokenStore, jwt decode, queryClient, cn  ✅ Step 4
│   ├── context/AuthContext.tsx  # login/logout/me bootstrap, proactive token refresh                       ✅ Step 4
│   ├── hooks/                   # one TanStack Query hook file per API concern (useBeds, useAdmitPatient, ...)  ✅ Step 4
│   ├── components/
│   │   ├── layout/              # DashboardLayout, Sidebar (role-filtered nav), Header, nav.config.ts       ✅ Step 4
│   │   ├── ui/                  # Button, Card, Badge, Modal, Drawer, Input, Select, Spinner, EmptyState    ✅ Step 4
│   │   └── ProtectedRoute.tsx   # auth + role gate, mirrors backend's protect -> authorizeRoles chain       ✅ Step 4
│   ├── pages/
│   │   ├── LoginPage.tsx, DashboardHome.tsx                                                                 ✅ Step 4
│   │   ├── ipd/BedManager.tsx   # color-coded ward/bed grid, admit modal, occupied-bed drawer + discharge   ✅ Step 4
│   │   ├── emr/DoctorDesk.tsx   # history/timeline panel + SOAP note form + prescription builder            ✅ Step 4
│   │   ├── pharmacy/DispensationQueue.tsx                                                                   ✅ Step 4
│   │   └── billing/InvoiceView.tsx  # print-friendly categorized invoice + payment mutation                 ✅ Step 4
│   ├── App.tsx                  # route tree, nested ProtectedRoute per role group
│   └── main.tsx                 # BrowserRouter + QueryClientProvider + AuthProvider
├── package.json
├── vite.config.ts               # /api dev-proxy to hims-backend
└── tailwind.config.ts

docker/                                                                 ✅ Step 5
├── Dockerfile.server            # hims-backend: deps -> build -> non-root production stage
├── Dockerfile.client            # hims-frontend: Vite build -> unprivileged Nginx (port 8080)
├── docker-compose.prod.yml      # mongo1-3 (replica set), mongo-setup, redis, api, web, nginx-proxy, certbot
├── .env.example                 # every var the compose file interpolates, with generation instructions
├── mongo/init-replica.sh        # idempotent rs.initiate() + root/scoped-app user bootstrap
└── nginx/
    ├── default.conf             # edge reverse proxy: TLS, security headers, /api/auth rate limiting
    └── client.conf              # baked into Dockerfile.client — internal static-file + SPA-fallback Nginx

DEPLOYMENT.md                                                          ✅ Step 5
```

## Domain → collection map (Step 1 deliverable)

| # | Domain | Collections | Key design notes |
|---|---|---|---|
| 1 | Patient Master Index | `patients` | Redis-backed atomic UHID counter (`generateUHID()`); embedded emergency contacts, ID proofs, biometrics (pointers only — no raw biometric data in Mongo), insurance snapshot |
| 2 | OPD | `doctors`, `doctor_schedules`, `opd_queue_tokens`, `opd_visits` | Token numbers assigned via Redis `INCR` per doctor/day, durably recorded in `opd_queue_tokens` with a compound unique index as a collision backstop |
| 3 | IPD & ADT | `wards`, `beds`, `admissions`, `discharge_summaries` | `Bed.status` flip + `Admission` creation always run inside one `withTransaction` call; `optimisticConcurrency` on `Bed` as defense in depth; full ADT movement history embedded on `Admission` |
| 4 | Clinical EMR | `clinical_notes`, `diagnoses`, `prescriptions`, `drug_allergies` | SOAP-structured notes; `Prescription` has a `pre("validate")` hard-stop against active `DrugAllergy` records unless explicitly overridden with a reason |
| 5 | Nurse Station & MAR | `vitals_logs`, `medication_administrations`, `shift_handovers` | MAR rows are generated per scheduled dose from a signed `Prescription`; `variancNote` required for MISSED/REFUSED/HELD |
| 6 | Pharmacy & SCM | `drugs`, `drug_batches`, `suppliers`, `purchase_orders`, `stock_transactions`, `dispensations` | FEFO-indexed batches (`{drugId, expiryDate, quantityOnHand}`); `stock_transactions` is an immutable ledger appended in the same transaction as every `quantityOnHand` mutation |
| 7 | LIMS | `lab_tests`, `lab_orders`, `specimens`, `lab_results` | `LabTest.referenceRanges` supports sex/age-banded ranges; `LabResult` enforces critical-value notification before a verified result saves |
| 8 | OT & Cath Lab | `ot_schedules`, `sterilization_logs` | Shared schema for OT and Cath Lab via `theatreType`; instrument sets only OT-eligible once linked to a PASS sterilization cycle |
| 9 | Billing, Tariff & Insurance | `tariff_masters`, `invoices`, `payments`, `insurance_policies`, `pre_authorizations` | Ward-category-differentiated pricing on `TariffMaster`; `Invoice` stores computed totals (not read-time aggregation) and uses `optimisticConcurrency`; `Payment` is a separate append-only ledger for partial payments/refunds |
| 10 | Admin, HR & RBAC | `departments`, `roles`, `users`, `staff_profiles` | `Role` documents hold an editable resource→actions permission matrix; `User` is the auth identity only, `StaffProfile`/`Doctor` carry HR/clinical profile data |
| 11 | Security & Audit | `audit_logs`, `refresh_tokens` | `AuditLog` blocks its own update/delete Mongoose middleware (defense in depth — revoke UPDATE/DELETE at the DB-user level too) and TTL-expires only after the compliance retention window; `RefreshToken` implements rotation with reuse-detection (family revocation) |

## ACID transaction policy

Every write that spans more than one collection with a financial,
inventory, or bed-occupancy consequence **must** go through
`withTransaction()` in `hims-backend/src/config/database.ts` — never a
raw `mongoose.startSession()`. `PharmacyService.dispenseMedication` and
`ADTService.admitPatient` (Step 2) are the first two services built on
it; `BillingService` and the remaining domain services follow the same
pattern as they're added.

## Step 2 deliverables (this checkpoint)

- **`auth.middleware.ts`** — `authenticate`/`authenticateOptional`: verifies the access JWT (HTTP-only cookie first, `Authorization: Bearer` fallback), re-fetches the `User` on every request so a deactivated/locked account or role change takes effect without waiting out the token TTL, and attaches a minimal `req.user` (never the full Mongoose document).
- **`rbac.middleware.ts`** — `authorizeRoles(...roles)` (static allowlist, as specified) plus `authorizePermission(resource, action)` (checks the editable `Role.permissions` matrix from Step 1, Redis-cached with a 300s TTL) for the "granular RBAC" requirement from the system scope.
- **`audit.interceptor.ts`** — `res.on("finish")`-based, fire-and-forget `AuditLog` writes after every response; derives `action` from the HTTP method (`GET`→READ, `POST`→CREATE, `PUT`/`PATCH`→UPDATE, `DELETE`→DELETE, a 403 anywhere→PERMISSION_DENIED), `resourceType` from an explicit override or the URL path, and `targetResource` from `:id`-shaped route params. Required adding an explicit `status: "SUCCESS" | "FAILED"` field to `AuditLog` (Step 1 only stored `statusCode`).
- **`pharmacy.service.ts`** — `PharmacyService.dispenseMedication`: FEFO-allocates the requested quantity across `DrugBatch` records (conditionally decrementing each with `findOneAndUpdate` as defense in depth alongside transaction snapshot isolation), appends immutable `StockTransaction` ledger rows, posts a priced `InvoiceLineItem` to the patient's DRAFT invoice (creating one if none exists, priced off `TariffMaster`), updates the `Prescription` item/overall status, and writes a `Dispensation` receipt — one `withTransaction` call, all-or-nothing.
- **`adt.service.ts`** — `ADTService.admitPatient`: claims a bed with a single conditional `findOneAndUpdate({ status: VACANT })` (the entire double-booking guard), creates the `Admission` document seeded with its first ADT movement-history entry, and links the bed back to the admission — one `withTransaction` call.
- **`utils/`** — `errors.ts` (typed `AppError` hierarchy every service throws), `objectId.ts`, `money.ts` (currency rounding), `sequenceGenerator.ts` (Redis-backed document numbers, e.g. `INV-2026-000042`), `assert.ts` (`firstOrThrow` for `Model.create()` results under `noUncheckedIndexedAccess`), `jwt.ts` (access/refresh sign+verify).

## Step 3 deliverables (this checkpoint)

- **`app.ts`** / **`server.ts`** — split so the configured Express app (`createApp()`) can exist independently of opening a listening socket; `/api` mounts the main router, `notFoundHandler`/`errorHandler` are the last two middlewares registered.
- **`middlewares/errorHandler.ts`** — every controller below calls `next(err)` on failure rather than shaping its own response; this is the one place that maps `AppError` → its `statusCode`/`code`, plus `ZodError`, Mongoose `ValidationError`/`CastError`, and Mongo duplicate-key (11000) errors, to an HTTP response.
- **`middlewares/audit.interceptor.ts`** gained `auditLogger(bucket, resourceTypeOverride?)` — an explicit-action-bucket ("READ"/"WRITE"/"DELETE") variant of Step 2's method-inferring `auditInterceptor()`, used on every route below. **`middlewares/rbac.middleware.ts`** and **`auth.middleware.ts`** gained a `SUPER_ADMIN` bypass and a `protect` alias for `authenticate`, respectively.
- **`opd.service.ts`** — `OPDService.bookAppointment`: issues the next Redis-backed queue token for a doctor's day and creates the linked `OPDVisit` in one transaction.
- **`emr.service.ts`** — `EMRService.addClinicalNote` (transactional: SOAP note + ICD-10 diagnoses commit together), `addPrescription` (dosage-calculator quantity = `frequencyPerDay × durationDays`, drug lookup, allergy hard-stop via the model's own hook), `getPatientTimeline` (fans out across 7 collections, merges into one chronologically-sorted view).
- **`billing.service.ts`** — `BillingService.payInvoice`: atomic `Payment` creation + `Invoice.amountPaid/amountDue/status` update; a DRAFT invoice is implicitly finalized on its first payment, which is what locks it from further charges (every charge-posting service only appends to a DRAFT invoice).
- **5 controller + route pairs**, all wired with `protect` → `authorizeRoles(...)` → `auditLogger(bucket, resourceType)` → handler, exactly matching the endpoint list and role gates in the spec. Every controller validates its request body with an inline Zod schema and calls `next(err)` on failure — no bare try/catch swallowing.
- **`routes/index.ts`** mounts every domain router under `/api`.

Two deliberate deviations from the literal spec, both to keep the system correct rather than just matching field names: (1) `POST /api/ipd/admit` accepts `wardType` but cross-checks it against the target bed's actual ward category rather than using it to *set* the admission's ward — the bed's own `wardId` is what `ADTService.admitPatient` trusts, since a client-supplied ward could otherwise disagree with the bed being admitted into. (2) EMR write endpoints resolve the acting `doctorId` from the authenticated user's linked `Doctor` profile rather than trusting a `doctorId` in the request body, so one doctor's account can never write a note/prescription under another doctor's name.

Not yet built at this checkpoint (login/refresh-token-rotation landed in Step 7 — see below): LIMS/OT controllers & routes (not in this checkpoint's scope), repositories layer (not needed yet — no domain's data access has grown complex enough to warrant one).

## Step 4 deliverables (this checkpoint)

New `hims-frontend/` client — React 18, Vite, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind CSS, TanStack Query, react-router-dom, react-hook-form + zod. `tsc -b && vite build` succeeds clean.

- **`context/AuthContext.tsx`** + **`lib/{tokenStore,jwt,axios}.ts`** — access token held in memory only (never localStorage — XSS resistance), attached via an axios request interceptor with the JWT decoded (`lib/jwt.ts`, dependency-free) to schedule a proactive refresh ahead of `exp`; a response interceptor retries once through a silent refresh on a `TOKEN_EXPIRED` 401. A page reload rehydrates the session from the HTTP-only cookie via `GET /api/auth/me`, never from anything client-readable.
- **`components/layout/`** — `DashboardLayout` (collapsible sidebar + header, `print:`-aware so `InvoiceView`'s print button doesn't print the chrome), `Sidebar` filtering `nav.config.ts` by `useAuth().hasRole(...)`, `ProtectedRoute` mirroring the backend's `protect -> authorizeRoles` chain per route group in `App.tsx`.
- **`pages/ipd/BedManager.tsx`** — color-coded grid over all 6 `BedStatus` values (not just the 3 the spec named); a VACANT bed opens `AdmitPatientModal` (UHID lookup → `ADTService.admitPatient`), an OCCUPIED bed opens `BedDetailDrawer` (admission detail + discharge).
- **`pages/emr/DoctorDesk.tsx`** — `PatientHistoryPanel` (timeline + recent vitals + active diagnoses, all from the Step 3 timeline endpoint) alongside `ClinicalNoteForm` (SOAP + a `useFieldArray` ICD-10 diagnoses list) and `PrescriptionBuilder` (medication search combobox, a "1-0-1"-style dosing-pattern input converted to the backend's `frequencyPerDay`, and an allergy-hard-stop → override-with-reason flow matching `Prescription`'s own validation hook from Step 1).
- **`pages/billing/InvoiceView.tsx`** — categorized, print-friendly invoice; `usePayInvoice` writes the mutation result straight into the `activeInvoice` query cache, so the status badge flips to PAID/PARTIALLY_PAID with no refetch, per the spec.
- **`hooks/`** — one TanStack Query hook file per API concern, exactly as asked (`useBeds`, `useAdmitPatient`, `usePatientTimeline`, plus every other read/mutation the four pages need).

**Backend gaps this frontend is built against but hims-backend doesn't implement yet** (each marked `// BACKEND GAP:` at its one call site — `grep -rn "BACKEND GAP" hims-frontend/src`), **as of Step 4:**
1. ~~`POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/refresh`, `GET /api/auth/me`~~ — **resolved in Step 7.** Step 2/3 built the `User` model, bcrypt hashing, and JWT utils these would use; Step 7 built the routes themselves.
2. `POST /api/ipd/:admissionId/discharge` + `GET /api/ipd/admissions/:admissionId` — needed by `BedManager`'s discharge button and occupied-bed drawer; the natural counterpart to `ADTService.admitPatient`. Still open.
3. `GET /api/pharmacy/drugs?search=` — needed by the prescription builder's medication search. Still open.

None of the four pages requested are stubs — every hook makes a real, correctly-typed call to either a real Step 3 endpoint or one of the gaps above, so each starts working the moment its endpoint lands.

## Step 5 deliverables (this checkpoint)

Full production deployment story for a single Linux host — see
`DEPLOYMENT.md` for the runnable walkthrough; summary here:

- **`docker/Dockerfile.server`** / **`docker/Dockerfile.client`** — multi-stage builds (deps/build/production for the API; Vite build → Nginx for the client), both running their application process as a dedicated non-root user, both with a `HEALTHCHECK`.
- **`docker/docker-compose.prod.yml`** — `mongo1`/`mongo2`/`mongo3` (a real 3-node replica set, `internal: true` network, `--keyFile` cluster auth), `mongo-setup` (transient, idempotent `rs.initiate()` + user bootstrap), `redis` (password-protected), `api`, `web`, `nginx-proxy` (the only container with published ports), and a profile-gated `certbot`. Validated with `docker compose config` against every var in `.env.example` populated — parses clean, including the `network_mode: service:mongo1` + `depends_on: condition: service_healthy/service_completed_successfully` combinations.
- **`docker/mongo/init-replica.sh`** — the genuinely tricky part: MongoDB's "localhost exception" (the only way to bootstrap the first admin user once `--keyFile` enforces auth from process start) applies strictly to true loopback connections, which a sibling container talking over the bridge network is not. Solved via `network_mode: "service:mongo1"` on `mongo-setup` rather than papering over it; the script is idempotent so re-running the stack after first boot is a no-op. Creates a scoped `readWrite`-only application user (least privilege), not just a root user.
- **`docker/nginx/default.conf`** — TLS termination, HSTS/X-Frame-Options/CSP/etc. security headers, a stricter `limit_req` zone on `/api/auth/` specifically (brute-force/credential-stuffing mitigation) than the rest of `/api/`, and WebSocket upgrade passthrough wired up (inert until hims-backend opens a WS endpoint, e.g. for a live OPD queue display — harmless to leave ready).
- **`DEPLOYMENT.md`** — env var reference table, exact `apt`-repository Docker install for Ubuntu 24.04, `ufw` firewall rules, the keyfile-generation + permission steps, the full Let's-Encrypt bootstrap (dummy self-signed cert so Nginx can start → real cert via the webroot ACME challenge → reload) since a fresh domain has no cert yet and Nginx won't start pointed at files that don't exist, and a systemd timer for renewal.

## Step 6 deliverables (this checkpoint)

Master Admin Control Center — a "God-mode" directory and CRUD surface over
Staff, Patients, Wards/Beds, and the Audit Log, gated to
`SUPER_ADMIN`/`HOSPITAL_ADMIN` only, on both tiers.

**Backend — `hims-backend/src/{services,controllers,routes}/admin.*`:**

- **`admin.service.ts`** — the business logic. Staff CRUD works against `User` joined (via aggregation `$lookup` + `$facet`, so pagination totals stay correct under a `departmentId` filter) to whichever of `StaffProfile`/`Doctor` the user's roles imply; password reset issues a fresh random temporary password and re-hashes it, never returns the hash. Patient directory is the same join pattern, plus **`mergePatients()`**: inside one `ClientSession`/transaction, every one of the 19 models in the system carrying a `patientId` (found via `grep -rl patientId src/models`, not guessed) gets `updateMany({patientId: dup}, {$set:{patientId: primary}})`, run sequentially — a single MongoDB session cannot multiplex concurrent operations — then the duplicate is soft-marked via `Patient`'s pre-existing `mergedIntoPatientId` field (built in Step 1 for exactly this), never hard-deleted. Ward/Bed management bridges to Step 1's `TariffMaster` for the "base rent per ward type" concern, since `Ward` itself carries no price field by design; bed status transitions exclude `OCCUPIED` (that state only comes from the ADT flow). Sort-field allowlists on every list function prevent arbitrary-field-sort injection.
- **`admin.controller.ts`** — zod `.strict()` request validation on every endpoint (rejects unexpected fields outright); shared `parsePagination()`/`parseSort()` helpers. Both "delete" endpoints (`DELETE /api/admin/users/:id`, `DELETE /api/admin/patients/:id`) are documented soft-deactivations, never hard deletes — the system has too many foreign-key references (createdBy, prescribedBy, historical clinical/audit records) and healthcare record-retention obligations for a real delete to be safe.
- **`admin.routes.ts`** — mounted at `/api/admin`; `router.use(protect, authorizeRoles(SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN))` gates the entire router once, then each route still runs `auditLogger(...)` so every admin action lands in the same immutable audit trail it can itself inspect.
- Endpoints: `GET/POST/PUT/PATCH/DELETE /api/admin/users(:id)`, `.../users/:id/reset-password`, `GET/PUT/DELETE /api/admin/patients(:id)`, `POST /api/admin/patients/merge`, `GET/POST/PUT /api/admin/wards(:id)`, `PATCH /api/admin/beds/:id/status`, `GET /api/admin/audit-logs` (filterable by `userId`, `actionType` — now `AuditAction | AuditAction[]` with `$in`, matching the "every WRITE action by X" spec example — `targetResource`, date range).

**Frontend — `hims-frontend/src/{pages/admin,hooks/useAdmin.ts,components/admin}`:**

- **`components/admin/DataTable.tsx`** — a generic, fully server-driven (`manualPagination`/`manualSorting`) TanStack Table v8 wrapper reused by all three directories, so search/filter/sort/pagination scale to a directory with thousands of rows instead of shipping the whole collection to the browser for client-side fuzzy search.
- **`pages/admin/AdminLayout.tsx`** — a dark-slate shell deliberately distinct from the clinical `DashboardLayout` (own sidebar, own header, "Exit to main dashboard" link) so admins always have a clear visual signal they're operating on raw system records; mounted as a sibling to the main app shell in `App.tsx`, not nested inside it.
- **`pages/admin/StaffDirectory.tsx`** + **`StaffEditDrawer.tsx`** — searchable/filterable/sortable staff table, slide-over create/edit form with conditional validation (doctor-only fields vs. general staff fields via zod `superRefine`), inline deactivate toggle, one-click password reset.
- **`pages/admin/PatientDirectory.tsx`** + **`PatientEditDrawer.tsx`** + **`MergePatientsModal.tsx`** — global patient search/edit (full demographics, including gender/blood group), deactivate, and a two-patient-lookup merge flow (built against the admin's own `/api/admin/patients` search rather than the clinical patient-lookup endpoint, which `HOSPITAL_ADMIN` isn't role-granted) showing a per-collection `recordsReassigned` count on success.
- **`pages/admin/InfrastructureMaster.tsx`** + **`WardEditModal.tsx`** — card grid of wards with live occupancy badges; a modal edits `baseRent`/`totalBedCapacity` and each bed's status individually (including "Under Maintenance"), backed by the Ward↔TariffMaster bridge in the service layer.
- **`pages/admin/AuditInspector.tsx`** — immutable audit feed polling every 15s; date range, a chip-toggle multi-select action-type filter, target-resource search, result filter, and a "performed by" dropdown sourced from the live staff directory; each row expands into request method/path/status/IP/user-agent and a JSON `fieldChanges` diff.
- **`hooks/useAdmin.ts`** — one TanStack Query hook per endpoint above (`useStaffDirectory`, `useUpdateUser`, `useResetPassword`, `usePatientDirectory`, `useMergePatients`, `useAdminWards`, `useUpdateWard`, `useUpdateBedStatus`, `useAuditLogs`, etc.), all list hooks using `placeholderData: keepPreviousData` so pagination/sort/filter changes don't flash a loading state.

Both `hims-backend` (`tsc --noEmit`) and `hims-frontend` (`tsc -b && vite build`) verify clean with these changes.

## Step 7 deliverables (this checkpoint)

Authentication Flow & Security Hardening — closes the single largest gap
flagged by the Step 6 architecture review: until now, nothing in the
system could actually log in.

**Backend — `hims-backend/src/{services,controllers,routes}/auth.*`:**

- **`services/auth.service.ts`** (`AuthService`, singleton-exported like every other domain service) —
  - **`login`** — looks up `User` by username (`+passwordHash` explicitly selected, since it's `select: false` on the schema) and verifies via the model's own `comparePassword` (bcrypt). Enforces the brute-force lockout counter Step 1 built into `User` (`failedLoginAttempts`/`lockedUntil`) but never used until now: 5 consecutive failures locks the account for 15 minutes (`AccountLockedError`, HTTP 423). Every other failure path — unknown username, wrong password, deactivated/administratively-locked account — returns the same generic "Invalid username or password" (401) specifically to prevent username enumeration; only an *already*-triggered lockout is disclosed, since by then the caller has already confirmed the username exists through repeated attempts. On success, issues a fresh access/refresh token pair and joins the login identity to whichever of `Doctor`/`StaffProfile` (and, through it, `Department`) carries the human-facing name, matching the frontend's `AuthUser` contract exactly.
  - **`refresh`** — full rotation with reuse-detection. Every refresh token is single-use: verifying it looks up its `RefreshToken` record by `jti`, and re-hashes the presented raw token to confirm it matches the stored SHA-256 (defense in depth beyond the JWT signature alone). A token already marked `isRevoked` — meaning it was already rotated past, or is a replay of a stolen token — triggers **family revocation**: every token sharing that `tokenFamilyId` is revoked and the whole session is forced back through a fresh login, rather than trusting any surviving sibling token. A legitimate refresh mints a new pair in the *same* family (so rotation doesn't look like a new "device" each time) and marks the presented token `ROTATED`.
  - **`logout`** — revokes the presented session's entire token family (so a cached-but-unrotated token from the same device can't be replayed after logout) and is a no-op, not an error, if no valid session is presented — logging out twice must still succeed.
  - **`getProfile`** — the `GET /api/auth/me` join, re-fetched live (not read off the JWT claims) so a display-name/department/role change is visible without waiting on the next token refresh — mirrors why `auth.middleware.ts` already re-fetches `User` on every request rather than trusting the JWT alone.
  - Login/refresh-reuse/logout write directly to `AuditLog` with the dedicated `LOGIN`/`LOGIN_FAILED`/`LOGOUT` `AuditAction` values Step 1 reserved for exactly this and that had never actually been used — the generic route-level `auditLogger` middleware can't do this correctly here, since it derives the actor from `req.user`, which isn't set yet on `/login` and isn't meaningful on an already-expired `/refresh` call.
- **`controllers/auth.controller.ts`** — zod-validated (`.strict()`) request bodies; sets/reads both tokens as `httpOnly`, `sameSite: "strict"` cookies (`secure` outside local dev), with the refresh cookie scoped to `path: "/api/auth"` only since nothing outside `/refresh`/`/logout` ever needs to see it. The access token is also returned in the JSON body on login/refresh so the SPA's in-memory token store has it immediately (see Step 4's `lib/tokenStore.ts`) without an extra round trip, and so non-cookie API clients still get a usable bearer token.
- **`routes/auth.routes.ts`** — `POST /login`, `POST /refresh`, `POST /logout` (all public — a request without a valid session is exactly what these need to handle), `GET /me` (behind `protect`). Mounted at `/api/auth` in `routes/index.ts`.
- **Two new `AppError` subclasses** in `utils/errors.ts`: `AccountLockedError` (423, temporary brute-force lockout) and `AccountDisabledError` (403, formalizing into the typed-error hierarchy the same "inactive or locked" condition `auth.middleware.ts` already handled ad hoc for already-issued tokens).

**Application-layer rate limiting — `hims-backend/src/app.ts`:**

Nginx's edge-level `/api/auth/` rate limiting (Step 5) is defense in depth, not a substitute — this app may not always run behind that specific Nginx config (a different load balancer, a direct deploy), so the limit now also lives in Express itself via `express-rate-limit`:
- A **strict limiter** (5 requests / 15 min per IP) on the credential/token-exchange auth surface: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`.
- A **standard limiter** (300 requests / 15 min per IP) on the rest of `/api/*` — replacing the single blanket limiter that previously covered everything, including `/healthz`/`/readyz` (now correctly excluded, since orchestrator health probes shouldn't be throttled at all).
- **`GET /api/auth/me` is deliberately on the standard limiter, not the strict one** — it's a read-only session check the frontend calls on every page load and new tab (see `AuthContext.tsx`'s bootstrap effect), has no credential-guessing surface (it either has a valid cookie or it doesn't), and a literal 5-per-15-minute cap on it would false-positive on ordinary multi-tab usage and silently log real users out. This is a deliberate, documented deviation from applying one uniform limiter to the entire `/api/auth/*` prefix, made to keep the feature actually usable rather than matching the literal path pattern.

Combined with the per-account lockout in `AuthService.login`, brute-forcing now has to defeat both an IP-based rate limit *and* an account-based attempt counter — a distributed attacker spreading attempts across many IPs still trips the account lockout; a single-IP attacker trips the rate limiter long before the account lockout would even matter.

Both `tsc --noEmit` and `npm run build` verify clean with these changes; no placeholder logic anywhere in the new auth surface.

## Step 8 deliverables (this checkpoint)

Closing Core Clinical API Gaps — the two remaining `// BACKEND GAP:` markers left in `hims-frontend` after Step 7 (`grep -rn "BACKEND GAP" hims-frontend/src` now returns nothing).

**IPD discharge — `hims-backend/src/services/adt.service.ts`, `controllers/ipd.controller.ts`, `routes/ipd.routes.ts`:**

- **`ADTService.dischargePatient`** — the natural counterpart to `admitPatient`, same ACID discipline: one `withTransaction` call marks the `Admission` discharged (status + `actualDischargeDate` + an appended `DISCHARGE` `bedMovementHistory` entry) and releases the bed via a *conditional* `findOneAndUpdate({_id, status: OCCUPIED})` — mirroring `admitPatient`'s own double-booking guard, so a bed that's unexpectedly not `OCCUPIED` (data drift, a race) aborts the whole transaction with a `ResourceUnavailableError` instead of silently overwriting an inconsistent state. The bed goes to `BedStatus.CLEANING`, not straight back to `VACANT` — a just-vacated bed needs housekeeping first; a ward/infrastructure workflow (Step 6's admin bed-status management) is what marks it `VACANT` once that's done. Guards against double-discharge via an `ACTIVE_ADMISSION_STATUSES` allowlist (`ConflictError` if the admission is already terminal). The frontend's five-value `dischargeType` vocabulary (`ROUTINE`/`LAMA`/`DAMA`/`TRANSFER_OUT`/`DECEASED`) is mapped onto the schema's four-value `AdmissionStatus` (`DAMA` and `LAMA` both mean "left early against advice" here; `TRANSFER_OUT` ends this admission the same way `ROUTINE` does, so it isn't confused with `AdmissionStatus.TRANSFERRED`, which means an in-hospital bed/ward move with the admission still open).
- **`GET /api/ipd/admissions/:admissionId`** / **`POST /api/ipd/admissions/:admissionId/discharge`** — both under a shared `BED_MANAGEMENT_ROLES` constant (Receptionist/Hospital Admin/Doctor/Head Nurse/Staff Nurse) matching `GET /api/ipd/wards`'s existing gate, since all three routes back the same `BedManager` UI surface (grid + occupied-bed drawer + its discharge button) and must not silently drift apart into inconsistent role gates.
- The discharge route path is `/admissions/:admissionId/discharge`, not the flatter `/​:admissionId/discharge` the Step 4 frontend hook had speculatively guessed — corrected for REST consistency with the sibling `GET /admissions/:admissionId` route, and the frontend hook (`useDischargePatient.ts`) updated to match, since that guess was never a fixed contract (it was explicitly flagged `// BACKEND GAP` pending exactly this step).

**Pharmacy drug search — `hims-backend/src/controllers/pharmacy.controller.ts`, `routes/pharmacy.routes.ts`:**

- **`GET /api/pharmacy/drugs?search=`** — case-insensitive regex over `genericName`/`brandName`/`drugCode`, `isActive: true` only, capped at 20 results. Deliberately regex, not the schema's existing `$text` index: `$text` tokenizes and stems whole words, so it wouldn't match a live-typed prefix like "par" against "Paracetamol" the way a combobox needs. User input runs through a new `escapeRegex()` helper (`utils/validation.ts`) before being interpolated into the pattern — without it, a search term containing regex metacharacters could throw or match far more than intended.
- Authorized for `DOCTOR` and `PHARMACIST` — the actual caller is the prescription builder's medication combobox on `DoctorDesk` (`EMR_ROLES`-gated at the frontend router), not the pharmacist-only dispensation worklist this router otherwise serves, so `PHARMACIST`-only (matching the router's other two routes) would have 403'd the one page that actually needs this endpoint.

Both `hims-backend` (`tsc --noEmit`, `npm run build`) and `hims-frontend` (`tsc -b`, `vite build`) verify clean.

## Step 9 deliverables (this checkpoint)

LIMS and OT/Cath Lab Implementation — the two domains that had schemas
since Step 1 but no business logic, controllers, or routes.

**LIMS — `hims-backend/src/services/lims.service.ts`, `controllers/lims.controller.ts`, `routes/lims.routes.ts`:**

- **`LIMSService.createLabOrder`** — creates the `LabOrder`, then accessions one `Specimen` per distinct `specimenType` among the ordered tests (tests sharing a physical draw, e.g. CBC + ESR from one EDTA tube, share one barcode — exactly what `Specimen.model.ts`'s own doc comment describes), linking each test line's `specimenId` back to its specimen — all in one `withTransaction` call, since `LabResult.specimenId` is schema-required and this step doesn't build a separate specimen-collection endpoint. Barcodes are pre-generated at order time (order entry prints the label a phlebotomist then applies), matching real lab-system accessioning workflow.
- **`LIMSService.submitLabResult`** — the reference-range engine. `selectReferenceRange()` picks the most specific applicable `LabTest.referenceRanges` band for each submitted parameter (sex-specific + age-banded beats sex-specific beats `ALL`-sex + age-banded beats plain `ALL`; a band whose sex or age doesn't match the patient is excluded outright, never merely deprioritized), and `determineFlag()` compares the numeric value against it — critical thresholds checked before the normal band, so a value that's both outside-normal and beyond-critical reports at the more severe flag. Per-parameter flags roll up into `LabResult.overallFlag` by worst-flag-wins severity. One transaction creates the `LabResult` and updates the owning `LabOrder`'s test-line status (and, once every line has a result, the order's own status), so a result can never exist without its order reflecting it. Blocks double-submission against an already-resulted line with a `ConflictError`.
- **`GET /api/lims/orders`** — the lab technician's worklist: orders not yet fully reported by default (or whichever statuses `?status=` names), sorted by priority (STAT/URGENT/ROUTINE) then age — sorted in-app since MongoDB can't order an enum by severity natively and this is a small, bounded worklist query, same reasoning as the pharmacy dispensation worklist.
- Role gates: `POST /orders` is `DOCTOR`-only (ordering is a clinical decision, same as EMR's prescription-writing routes); `GET /orders` and the result-entry route are `LAB_TECHNICIAN`-only.

**OT & Cath Lab — `hims-backend/src/services/ot.service.ts`, `controllers/ot.controller.ts`, `routes/ot.routes.ts`:**

- **`OTService.scheduleSurgery`** — the double-booking guard is a conflict query (same `theatreRoom`, a still-active booking whose scheduled window overlaps the requested one — `CANCELLED`/`POSTPONED` bookings don't block, everything else does, including `COMPLETED`, since a future booking is checked against other bookings' *planned* windows, not real-time actuals) followed by the `OTSchedule.create`, both inside one `withTransaction` call. Unlike `ADTService.admitPatient`'s single-document conditional claim, there's no one row to atomically flip for a range-overlap check — snapshot isolation across the transaction is what actually closes the race between two concurrent bookings for the same slot.
- **`OTService.logSterilization`** — a cycle only certifies **PASS** — the regulatory basis for every instrument set inside it being eligible for OT use — when *both* the biological indicator (the definitive spore-test proof of sterilization efficacy) and the chemical indicator pass; a `PENDING` or `FAIL` biological result forces every instrument set in the cycle to `FAIL` regardless of what's submitted per set, rather than trusting caller input to override a failed/unverified cycle. `SterilizationLog.model.ts` has no separate instrument-set master collection — a set's OT-use eligibility *is* this document's own `instrumentSets[].cycleResult` — so this is a single-collection write and doesn't need `withTransaction`.
- Both routes gated to `SystemRole.OT_COORDINATOR` (the closest existing role to "OT Admin" — there's no separate role for sterile-services staff in the Step 1 RBAC design).

Both `tsc --noEmit` and `npm run build` verify clean. One pre-existing typing quirk worth flagging for future services touching array-of-subdocument fields: `LabOrderAttrs.tests` (and similarly-shaped fields elsewhere) is typed against the plain `LabOrderTestLine[]` interface rather than a Mongoose `DocumentArray`, so `.id()` isn't available at the type level even though the runtime document has it; `submitLabResult` works around this with a narrow cast + `.find()` by `_id`, documented inline at the one call site.

## Roadmap status

- [x] **Step 1** — Architecture blueprint, folder structure, all Mongoose schemas/TS interfaces
- [x] **Step 2** — Auth + RBAC middleware, audit interceptor, Pharmacy Dispensation Engine, Bed ADT Engine (both ACID)
- [x] **Step 3** — App/router wiring, error handler, OPD/EMR/Billing services, controllers+routes for Patient/OPD, IPD/ADT, EMR, Pharmacy, Billing. As of Step 9, LIMS + OT controllers/routes are no longer out of scope — see below.
- [x] **Step 4** — Frontend: role-based shell, EMR workspace, bed grid, invoicing UI. As of Step 8, every `// BACKEND GAP` this frontend was built against is resolved.
- [x] **Step 5** — Docker, Nginx, production hosting guide. The stack builds and deploys today; as of Step 7, a fresh deploy can actually be logged into.
- [x] **Step 6** — Master Admin Control Center: global Staff/Patient/Ward/Audit-Log directory and CRUD, gated to `SUPER_ADMIN`/`HOSPITAL_ADMIN`, including ACID patient-record merging.
- [x] **Step 7** — Authentication flow (login/refresh-rotation-with-reuse-detection/logout/me) and application-layer rate limiting. Resolves the single largest gap called out by the Step 6 architecture review: the system is now actually usable end-to-end, not just built end-to-end.
- [x] **Step 8** — Closes the two remaining core-clinical API gaps: IPD discharge (`ADTService.dischargePatient`, atomic bed release) and pharmacy drug search (the prescription builder's medication combobox). The frontend built in Step 4 now has a real backend behind every one of its hooks.
- [x] **Step 9** — LIMS (lab order + reference-range-driven result flagging) and OT/Cath Lab (theatre double-booking guard + sterilization-cycle instrument eligibility) business logic, controllers, and routes. Every domain modeled in Step 1 now has a working backend; no frontend was built for either domain yet (out of scope for this step).

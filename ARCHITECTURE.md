# HIMS Platform — Architecture Blueprint (Steps 1-4)

A production-grade Hospital Information Management System living in this
repository alongside the pre-existing, unrelated "Ask the ERP" app
(`backend/`, `frontend/` — untouched). The HIMS platform is its own
top-level TypeScript/MERN system:

```
hims-backend/     Express + TypeScript API, MongoDB replica set, Redis
hims-frontend/    React (Vite/TS) client
docker/           Nginx config, compose files, deployment guide        [Step 5]
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

docker/                                                                 [Step 5]
├── backend.Dockerfile          # multi-stage build
├── frontend.Dockerfile         # multi-stage build
├── nginx/
│   └── nginx.conf              # reverse proxy, TLS, CSP/CORS/rate-limit headers
└── docker-compose.prod.yml     # mongo replica set (3 nodes), redis, backend, frontend, nginx
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

Not yet built: login/refresh-token-rotation service, LIMS/OT controllers & routes (not in this checkpoint's scope), repositories layer (not needed yet — no domain's data access has grown complex enough to warrant one).

## Step 4 deliverables (this checkpoint)

New `hims-frontend/` client — React 18, Vite, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind CSS, TanStack Query, react-router-dom, react-hook-form + zod. `tsc -b && vite build` succeeds clean.

- **`context/AuthContext.tsx`** + **`lib/{tokenStore,jwt,axios}.ts`** — access token held in memory only (never localStorage — XSS resistance), attached via an axios request interceptor with the JWT decoded (`lib/jwt.ts`, dependency-free) to schedule a proactive refresh ahead of `exp`; a response interceptor retries once through a silent refresh on a `TOKEN_EXPIRED` 401. A page reload rehydrates the session from the HTTP-only cookie via `GET /api/auth/me`, never from anything client-readable.
- **`components/layout/`** — `DashboardLayout` (collapsible sidebar + header, `print:`-aware so `InvoiceView`'s print button doesn't print the chrome), `Sidebar` filtering `nav.config.ts` by `useAuth().hasRole(...)`, `ProtectedRoute` mirroring the backend's `protect -> authorizeRoles` chain per route group in `App.tsx`.
- **`pages/ipd/BedManager.tsx`** — color-coded grid over all 6 `BedStatus` values (not just the 3 the spec named); a VACANT bed opens `AdmitPatientModal` (UHID lookup → `ADTService.admitPatient`), an OCCUPIED bed opens `BedDetailDrawer` (admission detail + discharge).
- **`pages/emr/DoctorDesk.tsx`** — `PatientHistoryPanel` (timeline + recent vitals + active diagnoses, all from the Step 3 timeline endpoint) alongside `ClinicalNoteForm` (SOAP + a `useFieldArray` ICD-10 diagnoses list) and `PrescriptionBuilder` (medication search combobox, a "1-0-1"-style dosing-pattern input converted to the backend's `frequencyPerDay`, and an allergy-hard-stop → override-with-reason flow matching `Prescription`'s own validation hook from Step 1).
- **`pages/billing/InvoiceView.tsx`** — categorized, print-friendly invoice; `usePayInvoice` writes the mutation result straight into the `activeInvoice` query cache, so the status badge flips to PAID/PARTIALLY_PAID with no refetch, per the spec.
- **`hooks/`** — one TanStack Query hook file per API concern, exactly as asked (`useBeds`, `useAdmitPatient`, `usePatientTimeline`, plus every other read/mutation the four pages need).

**Backend gaps this frontend is built against but hims-backend doesn't implement yet** (each marked `// BACKEND GAP:` at its one call site — `grep -rn "BACKEND GAP" hims-frontend/src`):
1. `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/refresh`, `GET /api/auth/me` — blocks everything; Step 2/3 built the `User` model, bcrypt hashing, and JWT utils these would use, but never the routes themselves.
2. `POST /api/ipd/:admissionId/discharge` + `GET /api/ipd/admissions/:admissionId` — needed by `BedManager`'s discharge button and occupied-bed drawer; the natural counterpart to `ADTService.admitPatient`.
3. `GET /api/pharmacy/drugs?search=` — needed by the prescription builder's medication search.

None of the four pages requested are stubs — every hook makes a real, correctly-typed call to either a real Step 3 endpoint or one of the three gaps above, so each starts working the moment its endpoint lands.

## Roadmap status

- [x] **Step 1** — Architecture blueprint, folder structure, all Mongoose schemas/TS interfaces
- [x] **Step 2** — Auth + RBAC middleware, audit interceptor, Pharmacy Dispensation Engine, Bed ADT Engine (both ACID)
- [x] **Step 3 (partial)** — App/router wiring, error handler, OPD/EMR/Billing services, controllers+routes for Patient/OPD, IPD/ADT, EMR, Pharmacy, Billing. Remaining: login/refresh-token-rotation service, LIMS + OT controllers/routes.
- [x] **Step 4** — Frontend: role-based shell, EMR workspace, bed grid, invoicing UI. Blocked end-to-end only by the auth routes and two smaller gaps listed above.
- [ ] **Step 5** — Docker, Nginx, production hosting guide

# HIMS Platform — Architecture Blueprint (Step 1)

A production-grade Hospital Information Management System living in this
repository alongside the pre-existing, unrelated "Ask the ERP" app
(`backend/`, `frontend/` — untouched). The HIMS platform is its own
top-level TypeScript/MERN system:

```
hims-backend/     Express + TypeScript API, MongoDB replica set, Redis
hims-frontend/    React (Vite/TS) client                              [Step 4]
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
│   │   ├── auth.middleware.ts   # JWT verify: HTTP-only cookie, Bearer fallback  ✅ Step 2
│   │   ├── rbac.middleware.ts   # authorizeRoles(...roles) + authorizePermission(resource, action)  ✅ Step 2
│   │   ├── audit.interceptor.ts # writes AuditLog after every response is sent  ✅ Step 2
│   │   └── errorHandler.ts                                             [Step 3]
│   ├── services/                                                       ✅ Step 2 (partial)
│   │   ├── pharmacy.service.ts  # PharmacyService.dispenseMedication — ACID stock deduction  ✅ Step 2
│   │   ├── adt.service.ts       # ADTService.admitPatient — ACID bed claim + admission  ✅ Step 2
│   │   └── ...                  # auth/login/refresh, billing, lab, OT services         [Step 2 cont'd]
│   ├── repositories/                                                   [Step 3]
│   │   └── ...                  # thin data-access layer wrapping models
│   ├── controllers/                                                    [Step 3]
│   │   └── ...                  # one controller per domain, calls services
│   ├── routes/                                                         [Step 3]
│   │   └── ...                  # Express routers, mounted in app.ts
│   ├── utils/                    # errors, objectId, money, sequenceGenerator, jwt, assert  ✅ Step 2
│   ├── app.ts                                                          [Step 3]
│   └── server.ts               # bootstrap: security middleware, health checks ✅ Step 1 (minimal)
├── test/
├── package.json                                                        ✅ Step 1
├── tsconfig.json                                                       ✅ Step 1
├── .env.example                                                        ✅ Step 1
└── README.md                                                           ✅ Step 1

hims-frontend/                                                          [Step 4]
├── src/
│   ├── app/                    # routing, providers (React Query, auth context)
│   ├── components/             # shared UI (shadcn/ui + Tailwind)
│   ├── features/
│   │   ├── opd/ ├── ipd/ ├── emr/ ├── pharmacy/ ├── lims/ ├── billing/ ...
│   ├── layouts/                # role-based nav shell
│   ├── lib/                    # api client, query hooks
│   └── types/                  # imports DTOs mirrored from hims-backend/src/types
├── package.json
├── vite.config.ts
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

Not yet built: `errorHandler.ts`, `app.ts`, login/refresh-token-rotation service, repositories, controllers, routes — all Step 3.

## Roadmap status

- [x] **Step 1** — Architecture blueprint, folder structure, all Mongoose schemas/TS interfaces
- [x] **Step 2 (partial)** — Auth + RBAC middleware, audit interceptor, Pharmacy Dispensation Engine, Bed ADT Engine (both ACID). Remaining: login/refresh-token-rotation service, Billing Service, error handler.
- [ ] **Step 3** — API controllers/routes for OPD, IPD, EMR, Pharmacy, LIMS, Billing
- [ ] **Step 4** — Frontend: role-based shell, EMR workspace, bed grid, invoicing UI
- [ ] **Step 5** — Docker, Nginx, production hosting guide

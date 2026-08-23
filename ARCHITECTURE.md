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
│   ├── middleware/                                                     [Step 2]
│   │   ├── authenticate.ts     # JWT verification from HTTP-only cookie
│   │   ├── authorize.ts        # RBAC: requires(resource, action)
│   │   ├── auditInterceptor.ts # writes AuditLog on every mutating/read request
│   │   └── errorHandler.ts
│   ├── services/                                                       [Step 2]
│   │   ├── auth/                # login, refresh-token rotation, logout
│   │   ├── billing/             # BillingService — ACID invoice + payment posting
│   │   ├── pharmacy/            # DispensationEngine — ACID stock deduction
│   │   ├── ipd/                 # BedADTEngine — ACID admit/transfer/discharge
│   │   └── ...                  # one service module per domain
│   ├── repositories/                                                   [Step 2/3]
│   │   └── ...                  # thin data-access layer wrapping models
│   ├── controllers/                                                    [Step 3]
│   │   └── ...                  # one controller per domain, calls services
│   ├── routes/                                                         [Step 3]
│   │   └── ...                  # Express routers, mounted in app.ts
│   ├── utils/                                                          [Step 2+]
│   ├── app.ts                                                          [Step 2]
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
raw `mongoose.startSession()`. This keeps retry-on-write-conflict and
majority write-concern behavior identical across the Billing Service, the
Pharmacy Stock Dispensation Engine, and the Bed ADT Engine landing in
Step 2.

## Roadmap status

- [x] **Step 1** — Architecture blueprint, folder structure, all Mongoose schemas/TS interfaces
- [ ] **Step 2** — Auth, RBAC middleware, audit interceptor, ACID-wrapped core services
- [ ] **Step 3** — API controllers/routes for OPD, IPD, EMR, Pharmacy, LIMS, Billing
- [ ] **Step 4** — Frontend: role-based shell, EMR workspace, bed grid, invoicing UI
- [ ] **Step 5** — Docker, Nginx, production hosting guide

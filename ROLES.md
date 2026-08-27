# HIMS — Features by Role

Every route in `hims-backend` is gated by `authorizeRoles(...)` (or, for the
two mobile-gateway endpoints, `protectMobile` + `authorizeRoles`), and every
screen in `hims-frontend` is gated the same way at the router/nav level
(`hims-frontend/src/App.tsx`, `src/components/layout/nav.config.ts`) — so
what follows is a direct reflection of the actual RBAC gates in the code,
not an aspirational feature list.

**`SUPER_ADMIN` bypasses every gate below unconditionally** — it's the
platform's break-glass role (`rbac.middleware.ts`) and always has full
access to everything in this document, including areas scoped to a single
narrow role elsewhere (OT scheduling, LIMS results, payroll, etc.). It is
listed once, below, rather than repeated on every other role's list.

Three access surfaces exist:
- **Web App** — a page in the main React SPA (`hims-frontend`)
- **Admin Console** — the separate admin shell at `/admin`
- **API only** — the backend endpoint is fully implemented and RBAC-enforced, but this build doesn't ship a dedicated browser screen for it (noted explicitly wherever it applies, so this list doesn't overclaim a UI that isn't there)
- **Mobile Gateway** — `/api/mobile/*`, a separate JWT-scoped API surface for the Patient App / Doctor App, not part of the web SPA

---

## SUPER_ADMIN — Platform Owner

Unrestricted access to every feature in this document. In addition:
- Full **Admin Console**: Staff Directory, Role Management, Patient
  Directory, Ward & Bed Tariff Master, Global Audit Inspector.
- The only role that can edit `SUPER_ADMIN`'s own permission grants — every
  other role's entry in Role Management is editable; this one shows
  read-only, by design.

## HOSPITAL_ADMIN — Hospital Administrator

The hospital's day-to-day operational admin. Full read/write on nearly
every clinical and operational desk, plus the admin-only back office:

- **Admin Console**: Staff Directory (create/edit/deactivate/reset-password
  for every user), Role Management (edit any editable role's permission
  matrix), Patient Directory (edit/deactivate/merge patient records), Ward
  & Bed Tariff Master, Global Audit Inspector (every action ever logged,
  filterable by user/action/date/status).
- **Web App**: Bed Manager, Billing, ER Triage Board, Blood Bank, Dialysis
  Scheduler, Phlebotomy Queue, Radiology Worklist, IVF / Obstetric /
  Pediatric EMR, DMO Handover, MRD File Tracker, ICD Coding Queue,
  Procurement Dashboard, Accounts Payable, Complaints Board, Control Tower.
- **API only**: Patient registration & OPD appointment booking, HR/Payroll
  (the only role with payroll access at all — doctor revenue-share
  statement generation/finalization), Insurance/TPA claim settlement,
  Biomedical Asset/AMC management, OT schedule (read-only — scheduling
  itself is OT_COORDINATOR's action).
- **Not included in**: LIMS (lab order entry is DOCTOR-only, result entry
  is LAB_TECHNICIAN-only) or Pharmacy dispensation (PHARMACIST-only) — a
  deliberate separation-of-duties boundary, not an oversight.

## DOCTOR — Physician

- **Web App**: Bed Manager, **EMR Desk** (SOAP clinical notes, ICD-10
  diagnoses, prescriptions, patient timeline), ER Triage Board, Blood Bank,
  Dialysis Scheduler, Radiology Worklist (+ split-screen report editor),
  IVF EMR, Obstetric EMR, Pediatric EMR, DMO Handover (author shift-handover
  notes as the outgoing duty doctor).
- **API only**: Lab order entry (`POST /api/lims/orders`), OT
  surgery-schedule viewing and surgical-site-infection flagging, drug
  catalog search (for the prescription builder).
- **Mobile Gateway (Doctor App)**: `GET /api/mobile/doctor/ipd-rounds` — a
  lightweight list of their admitted patients for a phone screen.

## HEAD_NURSE

- **Web App**: Bed Manager, ER Triage Board, Obstetric EMR, Pediatric EMR,
  Procurement Dashboard (raise/track ward supply indents).
- **API only**: Patient lookup by UHID, patient clinical timeline (read).
- Ward-level nursing documentation (vitals, medication administration,
  shift handover) is **modeled but not yet wired to an API** — see
  "Known gaps" at the end of this document.

## STAFF_NURSE

Same access as `HEAD_NURSE` (Bed Manager, Obstetric EMR, Pediatric EMR,
Procurement Dashboard, patient lookup/timeline) — the two roles aren't
currently split apart at any route gate in this build; `HEAD_NURSE` exists
as its own role for future ward-supervisor-only features (e.g. shift
handover sign-off) once the nursing module itself is wired up.

## RECEPTIONIST — Front Desk

- **Web App**: Bed Manager, ER Triage Board (register walk-in ER patients).
- **API only**: Patient registration (new UHID), OPD appointment booking,
  admit a patient to a ward bed, discharge a patient, patient clinical
  timeline (read).

## PHARMACIST

- **Web App**: **Dispensation Queue** (pending prescriptions, dispense
  against FEFO-ordered drug batches).
- **API only**: Drug catalog search.
- **Also has Web App access to**: Procurement Dashboard (ward indents,
  low-stock purchase-order generation, GRN receiving) — pharmacy inventory
  and hospital-wide procurement are one continuous supply chain in this
  build.

## LAB_TECHNICIAN

- **Web App**: Phlebotomy Queue (the technician's collection-station
  screen — print barcode labels, scan/log specimen collection).
- **API only**: Lab order worklist (read), specimen receiving
  (`COLLECTED` → `RECEIVED`), lab result entry (blocked by a hard guard
  until the specimen is marked `RECEIVED` — see `ARCHITECTURE.md` Step
  13).
- **Also on the Complaints Board** as a ticket-raising role (e.g. flagging
  a lab equipment issue).

## BILLING_EXECUTIVE

- **Web App**: **Billing** (view a patient's active invoice, record a
  payment).
- **API only**: Insurance/TPA claim desk (view claims, raise a pre-auth
  claim, respond to/query/settle one) — shared with `TPA_OFFICER`.

## OT_COORDINATOR — Operating Theatre / Cath Lab

- **API only** (no dedicated screen shipped in this build):
  - View the OT schedule
  - Schedule a surgery (theatre + staff double-booking guard)
  - Allocate a sterile instrument set to a booked surgery
  - Flag a surgical-site infection (shared with `DOCTOR`)
  - Log a sterilization cycle

## AUDITOR

- **Web App**: **Global Audit Inspector** is `HOSPITAL_ADMIN`/`SUPER_ADMIN`
  only, so `AUDITOR` doesn't get that screen — its own dedicated surface is
  the **Control Tower** dashboard: NABH quality indicators (OPD waiting
  time, ICU bounce-back rate, surgical-site infection rate) and financial
  analytics (department profitability, top revenue-generating doctors,
  pharmacy wastage), all read-only.

## PATIENT

- **Mobile Gateway (Patient App)** — the only role that authenticates
  through `/api/mobile/auth/login` (a separate, shorter-lived JWT than the
  staff web session) rather than the web SPA:
  - View their own upcoming OPD appointments
  - Book a new OPD appointment
- Has no access to the staff web SPA at all.

## BIOMEDICAL_ENGINEER

- **API only**: The biomedical asset registry — list/register equipment,
  log a breakdown, schedule preventive maintenance, renew an AMC contract,
  list and resolve maintenance tickets. (Shared with `HOSPITAL_ADMIN`.)

## TPA_OFFICER — Insurance Desk

- **API only**: The insurance/TPA claim desk — view claims, raise a
  pre-authorization claim, respond to or query one, settle a claim.
  (Shared with `BILLING_EXECUTIVE` and `HOSPITAL_ADMIN`.)

## ER_NURSE

- **Web App**: **ER Triage Board** — register an ER visit, assign a
  triage-color bay, record the ABCDE primary assessment, one-click convert
  a stabilized patient to a full IPD admission, discharge from the ER.

## BLOOD_BANK_TECHNICIAN

- **Web App**: **Blood Bank** — donor registry, log a donation into
  inventory, raise/perform a cross-match request, dispense a blood bag
  (hard-blocked if the cross-match isn't `COMPATIBLE` or the bag has
  expired).

## DIALYSIS_TECHNICIAN

- **Web App**: **Dialysis Scheduler** — book a patient onto a machine
  across shifts (double-booking guarded), start/complete/cancel a session,
  chart pre/post weight, heparin dose, and ultrafiltration volume.

## PHLEBOTOMIST

- **Web App**: Phlebotomy Queue's collection station, plus the **TV
  waiting-room display** (`/phlebotomy/board`, a kiosk-mode screen with no
  sidebar chrome) — print a barcode label, scan/log a sample as collected.

## RADIOLOGY_TECHNICIAN

- **Web App**: **Radiology Worklist** — see pending scans, schedule a
  machine slot, start/complete an exam, and (for a radiologist)
  the split-screen report editor: patient history on the left, typed
  findings/impression on the right, with critical-finding notification
  tracking.
- **API only**: The DICOM-Modality-Worklist-style JSON feed a real scanner
  console would poll.

## MRD_EXECUTIVE — Medical Record Department

- **Web App**: **MRD File Tracker** (barcode check-in/check-out of physical
  case files, full movement history, legal/insurance/patient-copy request
  log) and the **ICD Coding Queue** (the post-discharge coding backlog,
  finalize ICD-10 coding with an exactly-one-primary-code rule, or raise a
  query back to the treating doctor).

## PROCUREMENT_OFFICER

- **Web App**: **Procurement Dashboard** — review/approve ward supply
  indents, generate purchase orders (manually or pre-filled from the
  below-reorder-level list), submit/approve/cancel POs, log a Goods
  Receipt Note against an approved PO, verify it, then post it into the
  live stock ledger (the one ACID-transaction step in this desk).

## ACCOUNTS_EXECUTIVE

- **Web App**: **Accounts Payable** — log a non-patient expense (utilities,
  cleaning, vendor payments) with a vendor-invoice attachment, track
  pending vs. paid, mark an expense paid with a payment mode/reference.

## FACILITY_MANAGER

- **Web App**: **Complaints Board** — the full Kanban (Open → Assigned →
  In Progress → Resolved → Closed): assign a ticket to maintenance staff,
  track resolution time.

## MAINTENANCE_STAFF

- **Web App**: **Complaints Board**, same screen as `FACILITY_MANAGER` —
  work the tickets assigned to them through to resolution. (The route gate
  doesn't currently separate "assign" from "resolve" by role — both
  personas share the one board.)

---

## Roles that can raise a ticket but have no other dedicated desk

`DOCTOR`, `HEAD_NURSE`, `STAFF_NURSE`, `RECEPTIONIST`, `PHARMACIST`,
`LAB_TECHNICIAN`, `FACILITY_MANAGER`, and `MAINTENANCE_STAFF` can all open
the **Complaints Board** to raise a Facility Maintenance or Patient
Grievance ticket, even though most of them have their own primary desk
listed above — anyone on staff can flag a broken AC or log a grievance on
a patient's behalf.

## Known gaps (so this list doesn't overclaim)

- **Nursing documentation** (`VitalsLog`, `MedicationAdministration`,
  `ShiftHandover` — vitals charting, the medication administration record,
  nurse-to-nurse shift handover) has Mongoose schemas
  (`hims-backend/src/models/nursing/`) but no service/controller/route or
  screen yet — `HEAD_NURSE`/`STAFF_NURSE`'s core ward workflow beyond bed
  management and the specialty EMRs isn't exposed via the API in this
  build.
- Several roles above are marked **API only**: the backend endpoint is
  fully implemented and RBAC-enforced (and exercised by nothing but direct
  API calls today) because this build's frontend effort went into the
  screens `ARCHITECTURE.md` documents step by step, not a screen for every
  single backend module. `OT_COORDINATOR`, `BIOMEDICAL_ENGINEER`, and
  `TPA_OFFICER` have no dedicated screen at all yet.

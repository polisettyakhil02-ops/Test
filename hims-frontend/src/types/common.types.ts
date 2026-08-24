/**
 * Mirrors the enums in hims-backend/src/types/common.types.ts that the
 * client actually needs to render or submit. Kept as plain string-union
 * `as const` objects (not TS `enum`) so they serialize/compare identically
 * to what the API sends back — no separate runtime representation to
 * drift out of sync with the backend's string enum values.
 */

export const SystemRole = {
  SUPER_ADMIN: "SUPER_ADMIN",
  HOSPITAL_ADMIN: "HOSPITAL_ADMIN",
  DOCTOR: "DOCTOR",
  HEAD_NURSE: "HEAD_NURSE",
  STAFF_NURSE: "STAFF_NURSE",
  RECEPTIONIST: "RECEPTIONIST",
  PHARMACIST: "PHARMACIST",
  LAB_TECHNICIAN: "LAB_TECHNICIAN",
  BILLING_EXECUTIVE: "BILLING_EXECUTIVE",
  OT_COORDINATOR: "OT_COORDINATOR",
  AUDITOR: "AUDITOR",
  PATIENT: "PATIENT",
  BIOMEDICAL_ENGINEER: "BIOMEDICAL_ENGINEER",
  TPA_OFFICER: "TPA_OFFICER",
  ER_NURSE: "ER_NURSE",
  BLOOD_BANK_TECHNICIAN: "BLOOD_BANK_TECHNICIAN",
  DIALYSIS_TECHNICIAN: "DIALYSIS_TECHNICIAN",
  PHLEBOTOMIST: "PHLEBOTOMIST",
  RADIOLOGY_TECHNICIAN: "RADIOLOGY_TECHNICIAN",
  MRD_EXECUTIVE: "MRD_EXECUTIVE",
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];

export const Gender = {
  MALE: "MALE",
  FEMALE: "FEMALE",
  OTHER: "OTHER",
  UNKNOWN: "UNKNOWN",
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const BloodGroup = {
  A_POS: "A+",
  A_NEG: "A-",
  B_POS: "B+",
  B_NEG: "B-",
  AB_POS: "AB+",
  AB_NEG: "AB-",
  O_POS: "O+",
  O_NEG: "O-",
  UNKNOWN: "UNKNOWN",
} as const;
export type BloodGroup = (typeof BloodGroup)[keyof typeof BloodGroup];

export const WardCategory = {
  GENERAL: "GENERAL",
  SEMI_PRIVATE: "SEMI_PRIVATE",
  PRIVATE: "PRIVATE",
  DELUXE: "DELUXE",
  ICU: "ICU",
  NICU: "NICU",
  PICU: "PICU",
  CCU: "CCU",
  ISOLATION: "ISOLATION",
  HDU: "HDU",
} as const;
export type WardCategory = (typeof WardCategory)[keyof typeof WardCategory];

export const BedStatus = {
  VACANT: "VACANT",
  OCCUPIED: "OCCUPIED",
  RESERVED: "RESERVED",
  CLEANING: "CLEANING",
  MAINTENANCE: "MAINTENANCE",
  BLOCKED: "BLOCKED",
} as const;
export type BedStatus = (typeof BedStatus)[keyof typeof BedStatus];

export const AdmissionType = {
  EMERGENCY: "EMERGENCY",
  PLANNED: "PLANNED",
  REFERRAL: "REFERRAL",
  MATERNITY: "MATERNITY",
  DAYCARE: "DAYCARE",
} as const;
export type AdmissionType = (typeof AdmissionType)[keyof typeof AdmissionType];

export const AdmissionStatus = {
  ADMITTED: "ADMITTED",
  TRANSFERRED: "TRANSFERRED",
  DISCHARGED: "DISCHARGED",
  DISCHARGE_PENDING: "DISCHARGE_PENDING",
  LAMA: "LAMA",
  DECEASED: "DECEASED",
  ABSCONDED: "ABSCONDED",
} as const;
export type AdmissionStatus = (typeof AdmissionStatus)[keyof typeof AdmissionStatus];

export const EncounterType = {
  OPD: "OPD",
  IPD: "IPD",
  EMERGENCY: "EMERGENCY",
  TELEMEDICINE: "TELEMEDICINE",
} as const;
export type EncounterType = (typeof EncounterType)[keyof typeof EncounterType];

export const PrescriptionStatus = {
  ORDERED: "ORDERED",
  PARTIALLY_DISPENSED: "PARTIALLY_DISPENSED",
  DISPENSED: "DISPENSED",
  CANCELLED: "CANCELLED",
  ON_HOLD: "ON_HOLD",
} as const;
export type PrescriptionStatus = (typeof PrescriptionStatus)[keyof typeof PrescriptionStatus];

export const DrugRoute = {
  ORAL: "ORAL",
  IV: "IV",
  IM: "IM",
  SC: "SC",
  TOPICAL: "TOPICAL",
  INHALATION: "INHALATION",
  SUBLINGUAL: "SUBLINGUAL",
  RECTAL: "RECTAL",
  OPHTHALMIC: "OPHTHALMIC",
  OTIC: "OTIC",
  NASAL: "NASAL",
  OTHER: "OTHER",
} as const;
export type DrugRoute = (typeof DrugRoute)[keyof typeof DrugRoute];

export const DoseUnit = {
  mg: "mg",
  mcg: "mcg",
  g: "g",
  ml: "ml",
  IU: "IU",
  tablet: "tablet",
  drop: "drop",
  puff: "puff",
} as const;
export type DoseUnit = (typeof DoseUnit)[keyof typeof DoseUnit];

export const InvoiceStatus = {
  DRAFT: "DRAFT",
  FINALIZED: "FINALIZED",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentMode = {
  CASH: "CASH",
  CARD: "CARD",
  UPI: "UPI",
  NET_BANKING: "NET_BANKING",
  INSURANCE: "INSURANCE",
  CORPORATE: "CORPORATE",
  WALLET: "WALLET",
  CHEQUE: "CHEQUE",
} as const;
export type PaymentMode = (typeof PaymentMode)[keyof typeof PaymentMode];

export const PermissionAction = {
  CREATE: "CREATE",
  READ: "READ",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  APPROVE: "APPROVE",
  DISPENSE: "DISPENSE",
  ADMINISTER: "ADMINISTER",
  DISCHARGE: "DISCHARGE",
  BILL: "BILL",
  EXPORT: "EXPORT",
} as const;
export type PermissionAction = (typeof PermissionAction)[keyof typeof PermissionAction];

export const AuditAction = {
  CREATE: "CREATE",
  READ: "READ",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  LOGIN_FAILED: "LOGIN_FAILED",
  EXPORT: "EXPORT",
  PRINT: "PRINT",
  PERMISSION_DENIED: "PERMISSION_DENIED",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/* ============================================================================
 * Step 12 — Emergency/ER, Blood Bank, Dialysis & Nephrology
 * ==========================================================================*/

export const TriagePriority = {
  RED: "RED",
  YELLOW: "YELLOW",
  GREEN: "GREEN",
  BLACK: "BLACK",
} as const;
export type TriagePriority = (typeof TriagePriority)[keyof typeof TriagePriority];

export const ERVisitStatus = {
  WAITING: "WAITING",
  IN_TREATMENT: "IN_TREATMENT",
  ADMITTED: "ADMITTED",
  DISCHARGED: "DISCHARGED",
  LAMA: "LAMA",
  DECEASED: "DECEASED",
  TRANSFERRED_OUT: "TRANSFERRED_OUT",
} as const;
export type ERVisitStatus = (typeof ERVisitStatus)[keyof typeof ERVisitStatus];

export const ERArrivalMode = {
  AMBULANCE: "AMBULANCE",
  WALK_IN: "WALK_IN",
  POLICE: "POLICE",
  REFERRAL: "REFERRAL",
  OTHER: "OTHER",
} as const;
export type ERArrivalMode = (typeof ERArrivalMode)[keyof typeof ERArrivalMode];

export const ERBayType = {
  BED: "BED",
  CRASH_CART: "CRASH_CART",
  RESUS_BAY: "RESUS_BAY",
} as const;
export type ERBayType = (typeof ERBayType)[keyof typeof ERBayType];

export const AirwayStatus = {
  PATENT: "PATENT",
  COMPROMISED: "COMPROMISED",
  INTUBATED: "INTUBATED",
} as const;
export type AirwayStatus = (typeof AirwayStatus)[keyof typeof AirwayStatus];

export const BloodComponentType = {
  WHOLE_BLOOD: "WHOLE_BLOOD",
  PRBC: "PRBC",
  FFP: "FFP",
  PLATELETS: "PLATELETS",
  CRYOPRECIPITATE: "CRYOPRECIPITATE",
} as const;
export type BloodComponentType = (typeof BloodComponentType)[keyof typeof BloodComponentType];

export const BloodBagStatus = {
  AVAILABLE: "AVAILABLE",
  RESERVED: "RESERVED",
  ISSUED: "ISSUED",
  DISCARDED: "DISCARDED",
  EXPIRED: "EXPIRED",
} as const;
export type BloodBagStatus = (typeof BloodBagStatus)[keyof typeof BloodBagStatus];

export const CrossMatchStatus = {
  PENDING: "PENDING",
  COMPATIBLE: "COMPATIBLE",
  INCOMPATIBLE: "INCOMPATIBLE",
  FULFILLED: "FULFILLED",
  CANCELLED: "CANCELLED",
} as const;
export type CrossMatchStatus = (typeof CrossMatchStatus)[keyof typeof CrossMatchStatus];

export const DialysisShift = {
  MORNING: "MORNING",
  AFTERNOON: "AFTERNOON",
  EVENING: "EVENING",
  NIGHT: "NIGHT",
} as const;
export type DialysisShift = (typeof DialysisShift)[keyof typeof DialysisShift];

export const DialysisSessionStatus = {
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  ABORTED: "ABORTED",
} as const;
export type DialysisSessionStatus = (typeof DialysisSessionStatus)[keyof typeof DialysisSessionStatus];

export const VascularAccessType = {
  AV_FISTULA: "AV_FISTULA",
  AV_GRAFT: "AV_GRAFT",
  CENTRAL_VENOUS_CATHETER: "CENTRAL_VENOUS_CATHETER",
  OTHER: "OTHER",
} as const;
export type VascularAccessType = (typeof VascularAccessType)[keyof typeof VascularAccessType];

/* ============================================================================
 * Step 13 — Advanced Diagnostics & Sample Collection (Phlebotomy/RIS).
 * First frontend use of the LIMS/Asset vocabulary, so it's mirrored here
 * for the first time too.
 * ==========================================================================*/

export const LabOrderPriority = {
  ROUTINE: "ROUTINE",
  URGENT: "URGENT",
  STAT: "STAT",
} as const;
export type LabOrderPriority = (typeof LabOrderPriority)[keyof typeof LabOrderPriority];

export const SpecimenStatus = {
  PENDING_COLLECTION: "PENDING_COLLECTION",
  COLLECTED: "COLLECTED",
  IN_TRANSIT: "IN_TRANSIT",
  RECEIVED: "RECEIVED",
  REJECTED: "REJECTED",
  DISPOSED: "DISPOSED",
} as const;
export type SpecimenStatus = (typeof SpecimenStatus)[keyof typeof SpecimenStatus];

/** Only the imaging subset of the backend's full `AssetCategory` — the rest (ventilators, infusion pumps, ...) isn't relevant to Radiology. */
export const ImagingModality = {
  XRAY: "XRAY",
  CT_SCAN: "CT_SCAN",
  MRI: "MRI",
  ULTRASOUND: "ULTRASOUND",
} as const;
export type ImagingModality = (typeof ImagingModality)[keyof typeof ImagingModality];

export const AssetStatus = {
  ACTIVE: "ACTIVE",
  UNDER_MAINTENANCE: "UNDER_MAINTENANCE",
  AWAITING_PARTS: "AWAITING_PARTS",
  DECOMMISSIONED: "DECOMMISSIONED",
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const RadiologyOrderStatus = {
  ORDERED: "ORDERED",
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  REPORTED: "REPORTED",
  CANCELLED: "CANCELLED",
} as const;
export type RadiologyOrderStatus = (typeof RadiologyOrderStatus)[keyof typeof RadiologyOrderStatus];

export const RadiologyReportStatus = {
  DRAFT: "DRAFT",
  FINALIZED: "FINALIZED",
} as const;
export type RadiologyReportStatus = (typeof RadiologyReportStatus)[keyof typeof RadiologyReportStatus];

/* ============================================================================
 * Step 14 — Specialty EMRs (IVF, Obstetric, DMO) & Medical Record Department.
 * ==========================================================================*/

export const IvfProtocolType = {
  AGONIST_LONG: "AGONIST_LONG",
  AGONIST_SHORT: "AGONIST_SHORT",
  ANTAGONIST: "ANTAGONIST",
  MINI_IVF: "MINI_IVF",
  NATURAL_CYCLE: "NATURAL_CYCLE",
  FROZEN_EMBRYO_TRANSFER: "FROZEN_EMBRYO_TRANSFER",
} as const;
export type IvfProtocolType = (typeof IvfProtocolType)[keyof typeof IvfProtocolType];

export const IvfCycleStatus = {
  STIMULATION: "STIMULATION",
  TRIGGERED: "TRIGGERED",
  RETRIEVAL_DONE: "RETRIEVAL_DONE",
  FERTILIZATION_DONE: "FERTILIZATION_DONE",
  EMBRYO_TRANSFERRED: "EMBRYO_TRANSFERRED",
  LUTEAL_SUPPORT: "LUTEAL_SUPPORT",
  PREGNANCY_CONFIRMED: "PREGNANCY_CONFIRMED",
  NOT_PREGNANT: "NOT_PREGNANT",
  CANCELLED: "CANCELLED",
} as const;
export type IvfCycleStatus = (typeof IvfCycleStatus)[keyof typeof IvfCycleStatus];

export const FertilizationMethod = { IVF: "IVF", ICSI: "ICSI" } as const;
export type FertilizationMethod = (typeof FertilizationMethod)[keyof typeof FertilizationMethod];

export const EmbryoStage = { CLEAVAGE: "CLEAVAGE", BLASTOCYST: "BLASTOCYST" } as const;
export type EmbryoStage = (typeof EmbryoStage)[keyof typeof EmbryoStage];

export const ObstetricRecordStatus = {
  ANTENATAL: "ANTENATAL",
  IN_LABOR: "IN_LABOR",
  DELIVERED: "DELIVERED",
  POSTNATAL_DISCHARGED: "POSTNATAL_DISCHARGED",
} as const;
export type ObstetricRecordStatus = (typeof ObstetricRecordStatus)[keyof typeof ObstetricRecordStatus];

export const DeliveryMode = {
  VAGINAL_NORMAL: "VAGINAL_NORMAL",
  VAGINAL_INSTRUMENTAL: "VAGINAL_INSTRUMENTAL",
  CESAREAN_SECTION: "CESAREAN_SECTION",
} as const;
export type DeliveryMode = (typeof DeliveryMode)[keyof typeof DeliveryMode];

export const FetalPresentation = { CEPHALIC: "CEPHALIC", BREECH: "BREECH", TRANSVERSE: "TRANSVERSE", OTHER: "OTHER" } as const;
export type FetalPresentation = (typeof FetalPresentation)[keyof typeof FetalPresentation];

export const LiquorColor = {
  CLEAR: "CLEAR",
  MECONIUM_STAINED: "MECONIUM_STAINED",
  BLOOD_STAINED: "BLOOD_STAINED",
  ABSENT: "ABSENT",
} as const;
export type LiquorColor = (typeof LiquorColor)[keyof typeof LiquorColor];

export const DmoCriticalityLevel = { WATCH: "WATCH", URGENT: "URGENT", CRITICAL: "CRITICAL" } as const;
export type DmoCriticalityLevel = (typeof DmoCriticalityLevel)[keyof typeof DmoCriticalityLevel];

export const DmoHandoverStatus = { PENDING_ACKNOWLEDGEMENT: "PENDING_ACKNOWLEDGEMENT", ACKNOWLEDGED: "ACKNOWLEDGED" } as const;
export type DmoHandoverStatus = (typeof DmoHandoverStatus)[keyof typeof DmoHandoverStatus];

export const MrdArchiveStatus = { ARCHIVED: "ARCHIVED", CHECKED_OUT: "CHECKED_OUT" } as const;
export type MrdArchiveStatus = (typeof MrdArchiveStatus)[keyof typeof MrdArchiveStatus];

export const IcdCodingStatus = { PENDING: "PENDING", CODED: "CODED", QUERY_RAISED: "QUERY_RAISED" } as const;
export type IcdCodingStatus = (typeof IcdCodingStatus)[keyof typeof IcdCodingStatus];

export const MrdFileRequestType = {
  LEGAL: "LEGAL",
  INSURANCE: "INSURANCE",
  PATIENT_COPY: "PATIENT_COPY",
  INTERNAL_AUDIT: "INTERNAL_AUDIT",
} as const;
export type MrdFileRequestType = (typeof MrdFileRequestType)[keyof typeof MrdFileRequestType];

export const MrdFileRequestStatus = { PENDING: "PENDING", FULFILLED: "FULFILLED", DENIED: "DENIED" } as const;
export type MrdFileRequestStatus = (typeof MrdFileRequestStatus)[keyof typeof MrdFileRequestStatus];

/** Every API response's envelope shape (see hims-backend controllers: `res.json({ data: ... })`). */
export interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

/** The envelope shape for every paginated admin list endpoint (`res.json({ data, meta })`). */
export interface PaginatedEnvelope<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    pageCount: number;
  };
}

/** Shape of an error response body from hims-backend's errorHandler middleware. */
export interface ApiErrorBody {
  error: string;
  message: string;
}

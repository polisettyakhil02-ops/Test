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

/**
 * Shared enums, value objects, and DTO-level types used across every domain
 * module. Kept dependency-free (no mongoose imports) so the frontend can
 * import this same file verbatim for compile-time-shared DTOs.
 */

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
  UNKNOWN = "UNKNOWN",
}

export enum BloodGroup {
  A_POS = "A+",
  A_NEG = "A-",
  B_POS = "B+",
  B_NEG = "B-",
  AB_POS = "AB+",
  AB_NEG = "AB-",
  O_POS = "O+",
  O_NEG = "O-",
  UNKNOWN = "UNKNOWN",
}

export enum MaritalStatus {
  SINGLE = "SINGLE",
  MARRIED = "MARRIED",
  DIVORCED = "DIVORCED",
  WIDOWED = "WIDOWED",
  UNKNOWN = "UNKNOWN",
}

/** Granular RBAC roles per spec section X. Extend, never repurpose a value. */
export enum SystemRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  HOSPITAL_ADMIN = "HOSPITAL_ADMIN",
  DOCTOR = "DOCTOR",
  HEAD_NURSE = "HEAD_NURSE",
  STAFF_NURSE = "STAFF_NURSE",
  RECEPTIONIST = "RECEPTIONIST",
  PHARMACIST = "PHARMACIST",
  LAB_TECHNICIAN = "LAB_TECHNICIAN",
  BILLING_EXECUTIVE = "BILLING_EXECUTIVE",
  OT_COORDINATOR = "OT_COORDINATOR",
  AUDITOR = "AUDITOR",
  PATIENT = "PATIENT",
}

export enum PermissionAction {
  CREATE = "CREATE",
  READ = "READ",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  APPROVE = "APPROVE",
  DISPENSE = "DISPENSE",
  ADMINISTER = "ADMINISTER",
  DISCHARGE = "DISCHARGE",
  BILL = "BILL",
  EXPORT = "EXPORT",
}

export enum WardCategory {
  GENERAL = "GENERAL",
  SEMI_PRIVATE = "SEMI_PRIVATE",
  PRIVATE = "PRIVATE",
  DELUXE = "DELUXE",
  ICU = "ICU",
  NICU = "NICU",
  PICU = "PICU",
  CCU = "CCU",
  ISOLATION = "ISOLATION",
  HDU = "HDU",
}

export enum BedStatus {
  VACANT = "VACANT",
  OCCUPIED = "OCCUPIED",
  RESERVED = "RESERVED",
  CLEANING = "CLEANING",
  MAINTENANCE = "MAINTENANCE",
  BLOCKED = "BLOCKED",
}

export enum AdmissionStatus {
  ADMITTED = "ADMITTED",
  TRANSFERRED = "TRANSFERRED",
  DISCHARGED = "DISCHARGED",
  DISCHARGE_PENDING = "DISCHARGE_PENDING",
  LAMA = "LAMA", // Left Against Medical Advice
  DECEASED = "DECEASED",
  ABSCONDED = "ABSCONDED",
}

export enum AdmissionType {
  EMERGENCY = "EMERGENCY",
  PLANNED = "PLANNED",
  REFERRAL = "REFERRAL",
  MATERNITY = "MATERNITY",
  DAYCARE = "DAYCARE",
}

export enum EncounterType {
  OPD = "OPD",
  IPD = "IPD",
  EMERGENCY = "EMERGENCY",
  TELEMEDICINE = "TELEMEDICINE",
}

export enum PaymentMode {
  CASH = "CASH",
  CARD = "CARD",
  UPI = "UPI",
  NET_BANKING = "NET_BANKING",
  INSURANCE = "INSURANCE",
  CORPORATE = "CORPORATE",
  WALLET = "WALLET",
  CHEQUE = "CHEQUE",
}

export enum InvoiceStatus {
  DRAFT = "DRAFT",
  FINALIZED = "FINALIZED",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

export enum PayerType {
  SELF_PAY = "SELF_PAY",
  INSURANCE_TPA = "INSURANCE_TPA",
  CORPORATE = "CORPORATE",
  GOVERNMENT_SCHEME = "GOVERNMENT_SCHEME",
}

export enum PreAuthStatus {
  NOT_REQUIRED = "NOT_REQUIRED",
  PENDING = "PENDING",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  PARTIALLY_APPROVED = "PARTIALLY_APPROVED",
  REJECTED = "REJECTED",
  QUERY_RAISED = "QUERY_RAISED",
}

export enum PrescriptionStatus {
  ORDERED = "ORDERED",
  PARTIALLY_DISPENSED = "PARTIALLY_DISPENSED",
  DISPENSED = "DISPENSED",
  CANCELLED = "CANCELLED",
  ON_HOLD = "ON_HOLD",
}

export enum DrugRoute {
  ORAL = "ORAL",
  IV = "IV",
  IM = "IM",
  SC = "SC",
  TOPICAL = "TOPICAL",
  INHALATION = "INHALATION",
  SUBLINGUAL = "SUBLINGUAL",
  RECTAL = "RECTAL",
  OPHTHALMIC = "OPHTHALMIC",
  OTIC = "OTIC",
  NASAL = "NASAL",
  OTHER = "OTHER",
}

export enum AllergySeverity {
  MILD = "MILD",
  MODERATE = "MODERATE",
  SEVERE = "SEVERE",
  LIFE_THREATENING = "LIFE_THREATENING",
}

export enum LabOrderPriority {
  ROUTINE = "ROUTINE",
  URGENT = "URGENT",
  STAT = "STAT",
}

export enum LabOrderStatus {
  ORDERED = "ORDERED",
  SAMPLE_COLLECTED = "SAMPLE_COLLECTED",
  IN_LAB = "IN_LAB",
  RESULT_ENTERED = "RESULT_ENTERED",
  VERIFIED = "VERIFIED",
  REPORTED = "REPORTED",
  CANCELLED = "CANCELLED",
  REJECTED = "REJECTED",
}

export enum SpecimenStatus {
  PENDING_COLLECTION = "PENDING_COLLECTION",
  COLLECTED = "COLLECTED",
  IN_TRANSIT = "IN_TRANSIT",
  RECEIVED = "RECEIVED",
  REJECTED = "REJECTED",
  DISPOSED = "DISPOSED",
}

export enum ResultFlag {
  NORMAL = "NORMAL",
  LOW = "LOW",
  HIGH = "HIGH",
  CRITICAL_LOW = "CRITICAL_LOW",
  CRITICAL_HIGH = "CRITICAL_HIGH",
  ABNORMAL = "ABNORMAL",
}

export enum SurgeryStatus {
  SCHEDULED = "SCHEDULED",
  CONFIRMED = "CONFIRMED",
  PATIENT_IN_OT = "PATIENT_IN_OT",
  IN_PROGRESS = "IN_PROGRESS",
  RECOVERY = "RECOVERY",
  COMPLETED = "COMPLETED",
  POSTPONED = "POSTPONED",
  CANCELLED = "CANCELLED",
}

export enum StockTransactionType {
  PURCHASE_RECEIPT = "PURCHASE_RECEIPT",
  DISPENSATION = "DISPENSATION",
  RETURN_TO_STOCK = "RETURN_TO_STOCK",
  RETURN_TO_SUPPLIER = "RETURN_TO_SUPPLIER",
  ADJUSTMENT = "ADJUSTMENT",
  TRANSFER = "TRANSFER",
  EXPIRY_WRITE_OFF = "EXPIRY_WRITE_OFF",
  DAMAGE_WRITE_OFF = "DAMAGE_WRITE_OFF",
}

export enum PurchaseOrderStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED",
  RECEIVED = "RECEIVED",
  CANCELLED = "CANCELLED",
}

export enum AuditAction {
  CREATE = "CREATE",
  READ = "READ",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  LOGIN_FAILED = "LOGIN_FAILED",
  EXPORT = "EXPORT",
  PRINT = "PRINT",
  PERMISSION_DENIED = "PERMISSION_DENIED",
}

/** Embedded, reusable value objects (not standalone collections). */

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  alternatePhone?: string;
  address?: Address;
}

export interface VitalSigns {
  temperatureCelsius?: number;
  pulseRatePerMin?: number;
  respiratoryRatePerMin?: number;
  systolicBP?: number;
  diastolicBP?: number;
  spo2Percent?: number;
  painScore?: number; // 0-10
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
  recordedAt: Date;
  recordedByUserId: string;
}

export interface AuditableFields {
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ICD10_CODE_REGEX = /^[A-TV-Z][0-9][0-9AB](\.[0-9A-TV-Z]{1,4})?$/;
export const HEX_MONGO_ID_REGEX = /^[0-9a-fA-F]{24}$/;
export const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

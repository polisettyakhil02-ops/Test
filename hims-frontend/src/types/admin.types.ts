import type { SystemRole, WardCategory, BedStatus, AuditAction, Gender, BloodGroup } from "./common.types";
import type { Address, EmergencyContact, Patient } from "./patient.types";

/* ============================================================================
 * Staff Directory Master
 * ==========================================================================*/

export interface StaffProfileEmbed {
  _id: string;
  employeeCode: string;
  fullName: string;
  role?: SystemRole;
  departmentId: string;
  designation?: string;
  dateOfJoining?: string;
  qualifications?: string[];
  licenseNumber?: string;
  isActive: boolean;
}

export interface DoctorProfileEmbed {
  _id: string;
  employeeCode: string;
  fullName: string;
  departmentId: string;
  specializations: string[];
  registrationCouncil: string;
  registrationNumber: string;
  consultationFee: number;
  followUpFee?: number;
  phone: string;
  email: string;
  isActive: boolean;
}

/** One row from GET /api/admin/users — the aggregation-joined User + (StaffProfile | Doctor) shape; exactly one of the two embeds is present. */
export interface StaffDirectoryRow {
  _id: string;
  username: string;
  email: string;
  phone?: string;
  roles: SystemRole[];
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt?: string;
  createdAt: string;
  staffProfile?: StaffProfileEmbed;
  doctorProfile?: DoctorProfileEmbed;
}

export interface StaffDirectoryQuery {
  search?: string;
  role?: SystemRole;
  departmentId?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page: number;
  limit: number;
}

export interface CreateStaffPayload {
  username: string;
  email: string;
  phone?: string;
  password: string;
  roles: SystemRole[];
  fullName: string;
  departmentId: string;
  designation?: string;
  dateOfJoining: string;
  qualifications?: string[];
  licenseNumber?: string;
  specializations?: string[];
  registrationCouncil?: string;
  registrationNumber?: string;
  consultationFee?: number;
  followUpFee?: number;
}

export type UpdateStaffPayload = Partial<Omit<CreateStaffPayload, "username" | "password" | "dateOfJoining">> & {
  isActive?: boolean;
};

export interface Department {
  _id: string;
  name: string;
  code: string;
  isClinical: boolean;
  isActive: boolean;
}

/* ============================================================================
 * Patient Directory Master
 * ==========================================================================*/

export interface AdminPatientRow extends Patient {
  mergedIntoPatientId?: string;
}

export interface PatientDirectoryQuery {
  search?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page: number;
  limit: number;
}

export interface UpdatePatientAdminPayload {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: Gender;
  bloodGroup?: BloodGroup;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  address?: Address;
  emergencyContacts?: EmergencyContact[];
}

export interface MergePatientsPayload {
  primaryPatientId: string;
  duplicatePatientId: string;
}

export interface MergePatientsResult {
  primaryPatient: AdminPatientRow;
  recordsReassigned: Record<string, number>;
}

/* ============================================================================
 * Ward & Bed Tariff Master
 * ==========================================================================*/

export interface AdminWard {
  _id: string;
  name: string;
  code: string;
  category: WardCategory;
  floor: string;
  totalBedCapacity: number;
  nurseStationExtension?: string;
  isActive: boolean;
}

export interface AdminBed {
  _id: string;
  wardId: string;
  bedNumber: string;
  category: WardCategory;
  status: BedStatus;
  currentAdmissionId?: string;
  ratePerDay: number;
  hasOxygenSupply: boolean;
  hasVentilator: boolean;
  hasCardiacMonitor: boolean;
  outOfServiceReason?: string;
}

export interface WardWithTariff {
  ward: AdminWard;
  beds: AdminBed[];
  baseRent: number;
  occupancySummary: Partial<Record<BedStatus, number>>;
}

export interface CreateWardPayload {
  name: string;
  code: string;
  category: WardCategory;
  floor: string;
  totalBedCapacity: number;
  baseRent: number;
  nurseStationExtension?: string;
  generateBeds?: boolean;
}

export interface UpdateWardPayload {
  name?: string;
  floor?: string;
  totalBedCapacity?: number;
  nurseStationExtension?: string;
  isActive?: boolean;
  baseRent?: number;
}

export interface SetBedStatusPayload {
  bedId: string;
  status: BedStatus;
  reason?: string;
}

/* ============================================================================
 * Global Audit Inspector
 * ==========================================================================*/

export interface FieldChange {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface AuditLogEntry {
  _id: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  performedByUserId?: string;
  performedByUsername?: string;
  performedByRoles?: string[];
  ipAddress: string;
  userAgent?: string;
  fieldChanges?: FieldChange[];
  requestMethod?: string;
  requestPath?: string;
  statusCode?: number;
  status: "SUCCESS" | "FAILED";
  reasonDenied?: string;
  occurredAt: string;
}

export interface AuditLogQuery {
  userId?: string;
  actionType?: AuditAction[];
  targetResource?: string;
  status?: "SUCCESS" | "FAILED";
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page: number;
  limit: number;
}

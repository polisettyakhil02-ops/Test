import type { Gender, BloodGroup } from "./common.types";

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
}

/** Mirrors hims-backend PatientAttrs, over the wire: `_id`/dates arrive as strings. */
export interface Patient {
  _id: string;
  uhid: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  email?: string;
  address: Address;
  emergencyContacts: EmergencyContact[];
  knownAllergySummary?: string;
  isActive: boolean;
  isDeceased: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Doctor {
  _id: string;
  userId: string;
  employeeCode: string;
  fullName: string;
  specializations: string[];
  departmentId: string;
  consultationFee: number;
  followUpFee?: number;
  isActive: boolean;
}

export interface OPDQueueToken {
  _id: string;
  doctorId: string;
  patientId: string;
  visitDate: string;
  tokenNumber: number;
  status: string;
  priority: "NORMAL" | "SENIOR_CITIZEN" | "EMERGENCY" | "VIP";
}

export interface OPDVisit {
  _id: string;
  visitNumber: string;
  patientId: string;
  doctorId: string;
  queueTokenId: string;
  visitDate: string;
  chiefComplaint: string;
  consultationFeeCharged: number;
}

export interface BookAppointmentResult {
  queueToken: OPDQueueToken;
  visit: OPDVisit;
}

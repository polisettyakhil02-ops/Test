import type { Gender, BloodGroup, BloodComponentType, BloodBagStatus, CrossMatchStatus } from "./common.types";

export interface BloodDonor {
  _id: string;
  donorCode: string;
  fullName: string;
  age: number;
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  address?: string;
  lastDonationDate?: string;
  totalDonations: number;
  isEligible: boolean;
  ineligibilityReason?: string;
  medicalNotes?: string;
}

export interface RegisterDonorPayload {
  fullName: string;
  age: number;
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  address?: string;
  medicalNotes?: string;
}

export interface BloodBag {
  _id: string;
  bagNumber: string;
  donorId: string;
  bloodGroup: BloodGroup;
  componentType: BloodComponentType;
  volumeMl: number;
  collectionDate: string;
  expiryDate: string;
  screeningTestsPassed: boolean;
  status: BloodBagStatus;
  storageLocation: string;
  issuedToAdmissionId?: string;
  issuedAt?: string;
}

export interface LogDonationPayload {
  componentType: BloodComponentType;
  volumeMl: number;
  collectionDate: string;
  storageLocation: string;
  screeningTestsPassed: boolean;
}

export interface LogDonationResult {
  bag: BloodBag;
  donor: BloodDonor;
}

export interface InventoryRow {
  bag: BloodBag;
  isExpired: boolean;
  isDispensable: boolean;
}

export interface CrossMatchRequestPatientSummary {
  _id: string;
  uhid: string;
  firstName: string;
  lastName: string;
  bloodGroup: BloodGroup;
}

export interface CrossMatchRequest {
  _id: string;
  requestNumber: string;
  patientId: CrossMatchRequestPatientSummary | string;
  admissionId?: string;
  bloodGroupRequired: BloodGroup;
  componentType: BloodComponentType;
  unitsRequired: number;
  status: CrossMatchStatus;
  crossMatchedBagIds: string[];
  requestedByUserId: string;
  requestedAt: string;
  performedAt?: string;
  resultNotes?: string;
  urgent: boolean;
}

export interface RaiseCrossMatchRequestPayload {
  patientId: string;
  admissionId?: string;
  bloodGroupRequired: BloodGroup;
  componentType: BloodComponentType;
  unitsRequired: number;
  urgent?: boolean;
}

export interface PerformCrossMatchPayload {
  compatible: boolean;
  resultNotes?: string;
}

export interface DispenseBloodBagPayload {
  bagId: string;
  admissionId: string;
}

export interface DispenseBloodBagResult {
  bag: BloodBag;
  request: CrossMatchRequest;
}

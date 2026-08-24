import type { MrdArchiveStatus, IcdCodingStatus, MrdFileRequestType, MrdFileRequestStatus } from "./common.types";

export interface MrdPatientSummary {
  _id: string;
  uhid: string;
  firstName: string;
  lastName: string;
}

export interface EligibleAdmission {
  _id: string;
  admissionNumber: string;
  patientId: MrdPatientSummary | string;
  dischargeDate?: string;
}

export interface IcdCodeEntry {
  code: string;
  description: string;
  isPrimary: boolean;
}

export interface ArchiveMovement {
  checkedOutAt: string;
  checkedOutToUserId: string;
  checkedOutReason: string;
  checkedInAt?: string;
  checkedInByUserId?: string;
}

export interface MrdFileRequest {
  _id: string;
  requestType: MrdFileRequestType;
  requestedByName: string;
  requestedAt: string;
  purpose: string;
  status: MrdFileRequestStatus;
  fulfilledAt?: string;
  fulfilledByUserId?: string;
  denialReason?: string;
}

/** Mirrors MedicalRecordArchive.model.ts — patientId arrives populated on list/lookup responses. */
export interface MedicalRecordArchive {
  _id: string;
  archiveNumber: string;
  admissionId: string;
  patientId: MrdPatientSummary | string;
  fileBarcodeId: string;
  physicalLocation: string;
  status: MrdArchiveStatus;
  currentMovement?: ArchiveMovement;
  movementHistory: ArchiveMovement[];
  icdCodes: IcdCodeEntry[];
  icdCodingStatus: IcdCodingStatus;
  codedByUserId?: string;
  codedAt?: string;
  fileRequests: MrdFileRequest[];
  createdAt: string;
}

export interface CreateArchiveRecordPayload {
  admissionId: string;
  fileBarcodeId: string;
  physicalLocation: string;
}

export interface FinalizeIcdCodingPayload {
  icdCodes: IcdCodeEntry[];
}

export interface LogFileRequestPayload {
  requestType: MrdFileRequestType;
  requestedByName: string;
  purpose: string;
}

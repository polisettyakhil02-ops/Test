import type { TriagePriority, ERVisitStatus, ERArrivalMode, ERBayType, AirwayStatus, BedStatus } from "./common.types";

export interface ERBay {
  _id: string;
  bayNumber: string;
  bayType: ERBayType;
  status: BedStatus;
  currentErVisitId?: string;
  hasCardiacMonitor: boolean;
  hasOxygenSupply: boolean;
  isActive: boolean;
}

export interface ERVisitPatientSummary {
  _id: string;
  uhid: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
}

/** Mirrors ERVisit.model.ts as returned over the wire — `patientId`/`erBayId`/`treatingDoctorId` arrive populated (objects) from listErVisits, but are plain id strings anywhere else. */
export interface ERVisit {
  _id: string;
  erVisitNumber: string;
  patientId: ERVisitPatientSummary | string;
  chiefComplaint: string;
  arrivalMode: ERArrivalMode;
  arrivedAt: string;
  triagePriority: TriagePriority;
  triageNotes?: string;
  triagedAt?: string;
  isMedicoLegalCase: boolean;
  mlcNumber?: string;
  policeStationName?: string;
  mlcRemarks?: string;
  erBayId?: { _id: string; bayNumber: string; bayType: ERBayType } | string;
  treatingDoctorId?: { _id: string; fullName: string } | string;
  status: ERVisitStatus;
  dispositionAdmissionId?: string;
  dispositionNotes?: string;
  dischargedAt?: string;
  createdAt: string;
}

export interface RegisterErVisitPayload {
  patientId: string;
  chiefComplaint: string;
  arrivalMode: ERArrivalMode;
  triagePriority: TriagePriority;
  triageNotes?: string;
  isMedicoLegalCase: boolean;
  mlcNumber?: string;
  policeStationName?: string;
  mlcRemarks?: string;
}

export interface AssignBayPayload {
  bayId: string;
}

export interface AssignBayResult {
  visit: ERVisit;
  bay: ERBay;
}

export interface RecordPrimaryAssessmentPayload {
  airwayStatus: AirwayStatus;
  airwayNotes?: string;
  breathingRatePerMin?: number;
  breathingSpo2Percent?: number;
  breathingNotes?: string;
  circulationPulseRatePerMin?: number;
  circulationSystolicBP?: number;
  circulationDiastolicBP?: number;
  circulationCapillaryRefillSec?: number;
  circulationNotes?: string;
  disabilityGcsScore?: number;
  disabilityPupilResponse?: string;
  disabilityNotes?: string;
  exposureNotes?: string;
  overallImpression?: string;
}

export interface EmergencyEMREntry extends RecordPrimaryAssessmentPayload {
  _id: string;
  erVisitId: string;
  patientId: string;
  recordedByUserId: string;
  recordedAt: string;
}

export interface ConvertToIpdAdmissionPayload {
  bedId: string;
  attendingDoctorId: string;
  provisionalDiagnosis: string;
  guardianConsentObtained?: boolean;
}

export interface ConvertToIpdAdmissionResult {
  admission: { _id: string; admissionNumber: string };
  bed: { _id: string; bedNumber: string };
  visit: ERVisit;
}

export interface DischargeErVisitPayload {
  status: ERVisitStatus;
  dispositionNotes?: string;
}

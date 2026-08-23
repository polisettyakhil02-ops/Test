import type { WardCategory, BedStatus, AdmissionType, AdmissionStatus } from "./common.types";

/** One entry of GET /api/ipd/wards — the shape ipd.controller.ts's getWardsMap actually returns, not the raw Ward/Bed documents. */
export interface WardBedSummary {
  id: string;
  bedNumber: string;
  category: WardCategory;
  status: BedStatus;
  currentAdmissionId?: string;
  hasOxygenSupply: boolean;
  hasVentilator: boolean;
  hasCardiacMonitor: boolean;
}

export interface WardMapEntry {
  ward: {
    id: string;
    name: string;
    code: string;
    category: WardCategory;
    floor: string;
    totalBedCapacity: number;
  };
  occupancySummary: Partial<Record<BedStatus, number>>;
  beds: WardBedSummary[];
}

export interface BedMovementRecord {
  wardId: string;
  bedId: string;
  movementType: "ADMIT" | "TRANSFER" | "DISCHARGE";
  fromBedId?: string;
  reason?: string;
  effectiveAt: string;
  performedByUserId: string;
}

export interface Admission {
  _id: string;
  admissionNumber: string;
  patientId: string;
  admittingDoctorId: string;
  attendingDoctorId: string;
  admissionType: AdmissionType;
  status: AdmissionStatus;
  currentWardId: string;
  currentBedId: string;
  admissionDate: string;
  actualDischargeDate?: string;
  provisionalDiagnosis: string;
  finalDiagnosis?: string;
  bedMovementHistory: BedMovementRecord[];
  guardianConsentObtained: boolean;
}

export interface AdmitPatientPayload {
  patientId: string;
  bedId: string;
  wardType?: WardCategory;
  admittingDoctorId: string;
  attendingDoctorId: string;
  admissionType: AdmissionType;
  provisionalDiagnosis: string;
  guardianConsentObtained: boolean;
  referredFromOPDVisitId?: string;
}

export interface AdmitPatientResult {
  admission: Admission;
  bed: WardBedSummary & { wardId: string };
}

// BACKEND GAP: GET /api/ipd/admissions/:admissionId (returning
// { admission, patient }) and POST /api/ipd/:admissionId/discharge don't
// exist yet in hims-backend — Step 2's ADTService only built admitPatient.
// A dischargePatient method following the same withTransaction pattern
// (flip the bed back to VACANT, clear currentAdmissionId, set
// Admission.status = DISCHARGED + actualDischargeDate) plus a thin
// read for the occupied-bed drawer are the natural additions.
export interface AdmissionDetail {
  admission: Admission;
  patient: {
    _id: string;
    uhid: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  };
}

export interface DischargePatientPayload {
  admissionId: string;
  dischargeType?: "ROUTINE" | "LAMA" | "DAMA" | "TRANSFER_OUT" | "DECEASED";
  reason?: string;
}

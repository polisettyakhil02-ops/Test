import type { EncounterType, PrescriptionStatus, DrugRoute, DoseUnit } from "./common.types";

export interface DiagnosisInput {
  icd10Code: string;
  icd10Description: string;
  diagnosisType: "PROVISIONAL" | "CONFIRMED" | "DIFFERENTIAL" | "RULED_OUT";
  isChronic?: boolean;
  isPrimary?: boolean;
  notes?: string;
}

export interface Diagnosis extends DiagnosisInput {
  _id: string;
  patientId: string;
  clinicalNoteId: string;
  diagnosedAt: string;
}

export interface AddClinicalNotePayload {
  encounterType: EncounterType;
  opdVisitId?: string;
  admissionId?: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnoses: DiagnosisInput[];
  isSigned?: boolean;
}

export interface ClinicalNote {
  _id: string;
  patientId: string;
  doctorId: string;
  encounterType: EncounterType;
  opdVisitId?: string;
  admissionId?: string;
  encounterDate: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnosisIds: string[];
  isSigned: boolean;
}

export interface PrescriptionItemInput {
  drugId: string;
  doseValue: number;
  doseUnit: DoseUnit;
  route: DrugRoute;
  frequencyPerDay: number;
  durationDays: number;
  isPRN?: boolean;
  instructions?: string;
}

export interface AddPrescriptionPayload {
  clinicalNoteId: string;
  encounterType: "OPD" | "IPD";
  items: PrescriptionItemInput[];
  allergyOverride?: boolean;
  allergyOverrideReason?: string;
}

export interface PrescriptionItem extends PrescriptionItemInput {
  _id: string;
  drugName: string;
  computedTotalQuantity: number;
  quantityDispensed: number;
  itemStatus: PrescriptionStatus;
}

export interface Prescription {
  _id: string;
  prescriptionNumber: string;
  patientId: string;
  doctorId: string;
  clinicalNoteId: string;
  encounterType: "OPD" | "IPD";
  items: PrescriptionItem[];
  status: PrescriptionStatus;
  prescribedAt: string;
}

/** One row from GET /api/pharmacy/prescriptions/pending — patientId/doctorId are populated summaries there, not bare ids. */
export interface PendingPrescription extends Omit<Prescription, "patientId" | "doctorId"> {
  patientId: { _id: string; uhid: string; firstName: string; lastName: string; phone: string };
  doctorId: { _id: string; fullName: string; specializations: string[] };
}

export type TimelineEntryType =
  | "OPD_VISIT"
  | "ADMISSION"
  | "CLINICAL_NOTE"
  | "DIAGNOSIS"
  | "PRESCRIPTION"
  | "LAB_ORDER"
  | "DISCHARGE_SUMMARY";

export interface VitalSigns {
  temperatureCelsius?: number;
  pulseRatePerMin?: number;
  respiratoryRatePerMin?: number;
  systolicBP?: number;
  diastolicBP?: number;
  spo2Percent?: number;
  painScore?: number;
  recordedAt: string;
}

/** GET /api/emr/:patientId/timeline entries — `data` is the full source document, typed loosely since its shape depends on `type`. */
export interface TimelineEntry {
  type: TimelineEntryType;
  date: string;
  summary: string;
  refId: string;
  data: Record<string, unknown> & { vitals?: VitalSigns };
}

// BACKEND GAP: GET /api/pharmacy/drugs?search= doesn't exist yet in
// hims-backend — Step 3's pharmacy routes only covered the dispensation
// worklist/action, not browsing the Drug catalog. This is the assumed
// response contract for the prescription builder's medication search.
export interface DrugSearchResult {
  _id: string;
  drugCode: string;
  genericName: string;
  brandName?: string;
  defaultRoute: DrugRoute;
  packagingUnit: string;
}

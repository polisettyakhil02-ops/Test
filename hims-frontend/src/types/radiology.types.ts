import type { EncounterType } from "./common.types";
import type { ImagingModality, LabOrderPriority, RadiologyOrderStatus, RadiologyReportStatus } from "./common.types";

export interface RadiologyMachine {
  _id: string;
  assetCode: string;
  name: string;
  location: string;
  status: string;
  category: ImagingModality;
}

export interface RadiologyPatientSummary {
  _id: string;
  uhid: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
}

export interface RadiologyDoctorSummary {
  _id: string;
  fullName: string;
}

export interface RadiologyMachineSummary {
  _id: string;
  assetCode: string;
  name: string;
  location: string;
}

/** Mirrors RadiologyOrder.model.ts as returned by listWorklist — patientId/orderingDoctorId/machineAssetId arrive populated. */
export interface RadiologyOrder {
  _id: string;
  orderNumber: string;
  patientId: RadiologyPatientSummary | string;
  orderingDoctorId: RadiologyDoctorSummary | string;
  encounterType: EncounterType;
  modality: ImagingModality;
  machineAssetId?: RadiologyMachineSummary | string;
  bodyPart: string;
  clinicalIndication: string;
  contrastRequired: boolean;
  priority: LabOrderPriority;
  status: RadiologyOrderStatus;
  scheduledAt?: string;
  performedAt?: string;
  reportId?: string;
  orderedAt: string;
}

export interface CreateRadiologyOrderPayload {
  patientId: string;
  orderingDoctorId: string;
  encounterType: EncounterType;
  opdVisitId?: string;
  admissionId?: string;
  modality: ImagingModality;
  bodyPart: string;
  clinicalIndication: string;
  contrastRequired?: boolean;
  priority?: LabOrderPriority;
}

export interface ScheduleRadiologyOrderPayload {
  machineAssetId: string;
  scheduledAt: string;
}

export interface ModalityWorklistEntry {
  accessionNumber: string;
  scheduledProcedureStepStartDateTime?: string;
  modality: ImagingModality;
  patientId?: string;
  patientName?: string;
  patientBirthDate?: string;
  patientSex?: string;
  requestedProcedureDescription: string;
  referringPhysicianName?: string;
  studyInstanceUID: string;
}

export interface RadiologyReport {
  _id: string;
  radiologyOrderId: string;
  patientId: string;
  radiologistId: string;
  findings: string;
  impression: string;
  isCriticalFinding: boolean;
  criticalFindingNotifiedTo?: string;
  status: RadiologyReportStatus;
  dictatedAt: string;
  finalizedAt?: string;
}

export interface SaveReportDraftPayload {
  radiologistId: string;
  findings: string;
  impression: string;
  isCriticalFinding?: boolean;
  criticalFindingNotifiedTo?: string;
}

export interface FinalizeReportResult {
  report: RadiologyReport;
  order: RadiologyOrder;
}

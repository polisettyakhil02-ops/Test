import type { DialysisShift, DialysisSessionStatus, VascularAccessType } from "./common.types";

export interface DialysisMachine {
  _id: string;
  assetCode: string;
  name: string;
  location: string;
  status: string;
}

export interface DialysisSessionPatientSummary {
  _id: string;
  uhid: string;
  firstName: string;
  lastName: string;
}

export interface DialysisSessionMachineSummary {
  _id: string;
  assetCode: string;
  name: string;
  location: string;
}

export interface DialysisSessionDoctorSummary {
  _id: string;
  fullName: string;
}

/** Mirrors DialysisSession.model.ts as returned by listSessions — patientId/machineAssetId/nephrologistId arrive populated. */
export interface DialysisSession {
  _id: string;
  sessionNumber: string;
  patientId: DialysisSessionPatientSummary | string;
  admissionId?: string;
  machineAssetId: DialysisSessionMachineSummary | string;
  nephrologistId: DialysisSessionDoctorSummary | string;
  technicianUserId: string;
  shift: DialysisShift;
  scheduledStart: string;
  scheduledEnd: string;
  status: DialysisSessionStatus;
  vascularAccessType: VascularAccessType;
  preDialysisWeightKg: number;
  postDialysisWeightKg?: number;
  heparinDoseUnits: number;
  targetUltrafiltrationVolumeMl: number;
  actualUltrafiltrationVolumeMl?: number;
  bloodFlowRateMlPerMin?: number;
  dialysateFlowRateMlPerMin?: number;
  durationMinutes: number;
  preDialysisSystolicBP?: number;
  preDialysisDiastolicBP?: number;
  postDialysisSystolicBP?: number;
  postDialysisDiastolicBP?: number;
  complications?: string;
  notes?: string;
  cancellationReason?: string;
}

export interface ScheduleDialysisSessionPayload {
  patientId: string;
  admissionId?: string;
  machineAssetId: string;
  nephrologistId: string;
  technicianUserId: string;
  shift: DialysisShift;
  scheduledStart: string;
  scheduledEnd: string;
  vascularAccessType: VascularAccessType;
  preDialysisWeightKg: number;
  heparinDoseUnits: number;
  targetUltrafiltrationVolumeMl: number;
  bloodFlowRateMlPerMin?: number;
  dialysateFlowRateMlPerMin?: number;
  preDialysisSystolicBP?: number;
  preDialysisDiastolicBP?: number;
  notes?: string;
}

export interface CompleteDialysisSessionPayload {
  postDialysisWeightKg: number;
  actualUltrafiltrationVolumeMl: number;
  postDialysisSystolicBP?: number;
  postDialysisDiastolicBP?: number;
  complications?: string;
  notes?: string;
}

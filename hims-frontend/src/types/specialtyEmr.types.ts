import type {
  IvfProtocolType,
  IvfCycleStatus,
  FertilizationMethod,
  EmbryoStage,
  ObstetricRecordStatus,
  DeliveryMode,
  FetalPresentation,
  LiquorColor,
  Gender,
  DialysisShift,
  VaccinationDoseStatus,
  DmoCriticalityLevel,
  DmoHandoverStatus,
} from "./common.types";

export interface SpecialtyPatientSummary {
  _id: string;
  uhid: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
}
export interface SpecialtyDoctorSummary {
  _id: string;
  fullName: string;
}

/* ============================================================================
 * IVF EMR
 * ==========================================================================*/

export interface StimulationMonitoringVisit {
  visitDate: string;
  cycleDay: number;
  leftOvaryFollicleCount?: number;
  rightOvaryFollicleCount?: number;
  leadFollicleSizeMm?: number;
  endometrialThicknessMm?: number;
  estradiolPgMl?: number;
  notes?: string;
  recordedByUserId: string;
}

export interface EmbryoTransferRecord {
  transferDate: string;
  embryosTransferredCount: number;
  embryoStage: EmbryoStage;
  isFrozenTransfer: boolean;
  catheterUsed?: string;
  notes?: string;
}

/** Mirrors IvfCycle.model.ts — patientId/fertilitySpecialistId arrive populated. */
export interface IvfCycle {
  _id: string;
  cycleNumber: string;
  patientId: SpecialtyPatientSummary | string;
  partnerPatientId?: string;
  fertilitySpecialistId: SpecialtyDoctorSummary | string;
  protocolType: IvfProtocolType;
  status: IvfCycleStatus;
  stimulationStartDate: string;
  stimulationRegimen: string;
  monitoringVisits: StimulationMonitoringVisit[];
  triggerShotDate?: string;
  triggerDrugName?: string;
  eggRetrievalDate?: string;
  oocytesRetrievedCount?: number;
  matureOocytesCount?: number;
  fertilizationMethod?: FertilizationMethod;
  embryosFormedCount?: number;
  embryosFrozenCount?: number;
  embryoTransfers: EmbryoTransferRecord[];
  betaHcgTestDate?: string;
  betaHcgResultMIUmL?: number;
  isPregnant?: boolean;
  cancellationReason?: string;
}

export interface CreateIvfCyclePayload {
  patientId: string;
  partnerPatientId?: string;
  fertilitySpecialistId: string;
  protocolType: IvfProtocolType;
  stimulationStartDate: string;
  stimulationRegimen: string;
}

/* ============================================================================
 * Obstetric EMR
 * ==========================================================================*/

export interface AncVisit {
  visitDate: string;
  gestationWeeks: number;
  weightKg: number;
  bloodPressureSystolic: number;
  bloodPressureDiastolic: number;
  fundalHeightCm?: number;
  fetalHeartRatePerMin?: number;
  fetalPresentation?: FetalPresentation;
  urineAlbumin?: "NIL" | "TRACE" | "1+" | "2+" | "3+";
  pedalEdema: boolean;
  notes?: string;
  recordedByUserId: string;
}

export interface PartographReading {
  recordedAt: string;
  cervicalDilationCm: number;
  fetalHeartRatePerMin: number;
  contractionsPer10Min: number;
  descentOfHeadStation: number;
  liquorColor: LiquorColor;
  moulding: 0 | 1 | 2 | 3;
  maternalPulsePerMin: number;
  maternalSystolicBP: number;
  maternalDiastolicBP: number;
  maternalTemperatureCelsius?: number;
  oxytocinUnitsPerMin?: number;
  recordedByUserId: string;
}

export interface DeliveryDetails {
  deliveryDate: string;
  deliveryMode: DeliveryMode;
  babyWeightGrams: number;
  apgarScore1Min: number;
  apgarScore5Min: number;
  babySex: Gender;
  isLiveBirth: boolean;
  complications?: string;
  conductedByDoctorId: string;
}

/** Mirrors ObstetricRecord.model.ts — patientId/obstetricianId arrive populated. */
export interface ObstetricRecord {
  _id: string;
  recordNumber: string;
  patientId: SpecialtyPatientSummary | string;
  obstetricianId: SpecialtyDoctorSummary | string;
  admissionId?: string;
  lmpDate: string;
  eddDate: string;
  gravida: number;
  para: number;
  abortions: number;
  livingChildren: number;
  status: ObstetricRecordStatus;
  ancVisits: AncVisit[];
  partographReadings: PartographReading[];
  laborOnsetAt?: string;
  deliveryDetails?: DeliveryDetails;
}

export interface CreateObstetricRecordPayload {
  patientId: string;
  obstetricianId: string;
  lmpDate: string;
  eddDate?: string;
  gravida: number;
  para: number;
  abortions?: number;
  livingChildren?: number;
}

/* ============================================================================
 * Pediatric EMR
 * ==========================================================================*/

export interface VaccinationDose {
  vaccineName: string;
  doseNumber: number;
  dueDate: string;
  administeredDate?: string;
  batchNumber?: string;
  administeredByUserId?: string;
  status: VaccinationDoseStatus;
}

export interface GrowthChartEntry {
  recordedAt: string;
  ageInMonths: number;
  weightKg: number;
  heightCm: number;
  headCircumferenceCm?: number;
  recordedByUserId: string;
}

/** Mirrors PediatricRecord.model.ts — patientId/pediatricianId arrive populated. */
export interface PediatricRecord {
  _id: string;
  recordNumber: string;
  patientId: SpecialtyPatientSummary | string;
  pediatricianId: SpecialtyDoctorSummary | string;
  vaccinationSchedule: VaccinationDose[];
  growthChartEntries: GrowthChartEntry[];
  allergyNotes?: string;
}

export interface CreatePediatricRecordPayload {
  patientId: string;
  pediatricianId: string;
}

export interface RecordVaccineAdministeredPayload {
  vaccineName: string;
  doseNumber: number;
  administeredDate: string;
  batchNumber: string;
}

export interface AddGrowthChartEntryPayload {
  recordedAt: string;
  weightKg: number;
  heightCm: number;
  headCircumferenceCm?: number;
}

/* ============================================================================
 * DMO Handover
 * ==========================================================================*/

/** Mirrors DmoHandoverNote.model.ts — patientId/dutyDoctorId arrive populated. */
export interface DmoHandoverNote {
  _id: string;
  noteNumber: string;
  patientId: SpecialtyPatientSummary | string;
  admissionId?: string;
  dutyDoctorId: SpecialtyDoctorSummary | string;
  shift: DialysisShift;
  shiftDate: string;
  criticalityLevel: DmoCriticalityLevel;
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
  actionItems: string[];
  status: DmoHandoverStatus;
  acknowledgedByUserId?: string;
  acknowledgedAt?: string;
}

export interface CreateDmoHandoverNotePayload {
  patientId: string;
  admissionId?: string;
  dutyDoctorId: string;
  shift: DialysisShift;
  shiftDate: string;
  criticalityLevel: DmoCriticalityLevel;
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
  actionItems?: string[];
}

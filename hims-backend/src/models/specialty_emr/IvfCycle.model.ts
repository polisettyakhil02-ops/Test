import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { IvfProtocolType, IvfCycleStatus, FertilizationMethod, EmbryoStage } from "../../types/common.types.js";

/** One stimulation-monitoring (follicular scan) visit within a cycle. */
export interface StimulationMonitoringVisit {
  visitDate: Date;
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
  transferDate: Date;
  embryosTransferredCount: number;
  embryoStage: EmbryoStage;
  isFrozenTransfer: boolean;
  catheterUsed?: string;
  notes?: string;
}

/**
 * One ART (Assisted Reproductive Technology) attempt, from ovarian
 * stimulation through embryo transfer and the beta-hCG pregnancy test.
 * Modeled as a single growing document rather than one row per stage —
 * every field on this cycle only ever means something in the context of
 * this one attempt (the same reasoning `DialysisSession` already uses for
 * its own chart fields), so `IvfService` updates it in place through a
 * sequence of single-document transitions instead of a multi-collection
 * write.
 */
export interface IvfCycleAttrs {
  cycleNumber: string; // e.g. "IVF-2026-000042"
  patientId: Types.ObjectId;
  partnerPatientId?: Types.ObjectId; // optional linked spouse/partner, also a Patient record
  fertilitySpecialistId: Types.ObjectId; // ref -> Doctor
  protocolType: IvfProtocolType;
  status: IvfCycleStatus;
  stimulationStartDate: Date;
  stimulationRegimen: string; // narrative drug/dose schedule — protocols vary too widely for a rigid dosage table
  monitoringVisits: StimulationMonitoringVisit[];
  triggerShotDate?: Date;
  triggerDrugName?: string;
  eggRetrievalDate?: Date;
  oocytesRetrievedCount?: number;
  matureOocytesCount?: number;
  fertilizationMethod?: FertilizationMethod;
  embryosFormedCount?: number;
  embryosFrozenCount?: number;
  embryoTransfers: EmbryoTransferRecord[];
  lutealSupportNotes?: string;
  betaHcgTestDate?: Date;
  betaHcgResultMIUmL?: number;
  isPregnant?: boolean;
  cancellationReason?: string;
  createdBy: string;
}

export type IvfCycleDocument = HydratedDocument<IvfCycleAttrs>;

const StimulationMonitoringVisitSchema = new Schema<StimulationMonitoringVisit>(
  {
    visitDate: { type: Date, required: true },
    cycleDay: { type: Number, required: true, min: 1 },
    leftOvaryFollicleCount: { type: Number, min: 0 },
    rightOvaryFollicleCount: { type: Number, min: 0 },
    leadFollicleSizeMm: { type: Number, min: 0 },
    endometrialThicknessMm: { type: Number, min: 0 },
    estradiolPgMl: { type: Number, min: 0 },
    notes: { type: String, trim: true, maxlength: 1000 },
    recordedByUserId: { type: String, required: true },
  },
  { _id: false },
);

const EmbryoTransferRecordSchema = new Schema<EmbryoTransferRecord>(
  {
    transferDate: { type: Date, required: true },
    embryosTransferredCount: { type: Number, required: true, min: 1, max: 5 },
    embryoStage: { type: String, required: true, enum: Object.values(EmbryoStage) },
    isFrozenTransfer: { type: Boolean, required: true, default: false },
    catheterUsed: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const IvfCycleSchema = new Schema<IvfCycleAttrs>(
  {
    cycleNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    partnerPatientId: { type: Schema.Types.ObjectId, ref: "Patient" },
    fertilitySpecialistId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    protocolType: { type: String, required: true, enum: Object.values(IvfProtocolType) },
    status: { type: String, required: true, enum: Object.values(IvfCycleStatus), default: IvfCycleStatus.STIMULATION },
    stimulationStartDate: { type: Date, required: true },
    stimulationRegimen: { type: String, required: true, trim: true, maxlength: 2000 },
    monitoringVisits: { type: [StimulationMonitoringVisitSchema], default: [] },
    triggerShotDate: { type: Date },
    triggerDrugName: { type: String, trim: true },
    eggRetrievalDate: { type: Date },
    oocytesRetrievedCount: { type: Number, min: 0 },
    matureOocytesCount: { type: Number, min: 0 },
    fertilizationMethod: { type: String, enum: Object.values(FertilizationMethod) },
    embryosFormedCount: { type: Number, min: 0 },
    embryosFrozenCount: { type: Number, min: 0 },
    embryoTransfers: { type: [EmbryoTransferRecordSchema], default: [] },
    lutealSupportNotes: { type: String, trim: true, maxlength: 1000 },
    betaHcgTestDate: { type: Date },
    betaHcgResultMIUmL: { type: Number, min: 0 },
    isPregnant: { type: Boolean },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "ivf_cycles" },
);

IvfCycleSchema.index({ patientId: 1, stimulationStartDate: -1 });
IvfCycleSchema.index({ status: 1 });

export const IvfCycle: Model<IvfCycleAttrs> = model<IvfCycleAttrs>("IvfCycle", IvfCycleSchema);

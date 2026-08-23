import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import type { VitalSigns } from "../../types/common.types.js";

const VitalSignsSchema = new Schema<VitalSigns>(
  {
    temperatureCelsius: { type: Number, min: 25, max: 45 },
    pulseRatePerMin: { type: Number, min: 0, max: 300 },
    respiratoryRatePerMin: { type: Number, min: 0, max: 120 },
    systolicBP: { type: Number, min: 0, max: 350 },
    diastolicBP: { type: Number, min: 0, max: 250 },
    spo2Percent: { type: Number, min: 0, max: 100 },
    painScore: { type: Number, min: 0, max: 10 },
    heightCm: { type: Number, min: 0, max: 300 },
    weightKg: { type: Number, min: 0, max: 500 },
    bmi: { type: Number, min: 0, max: 200 },
    recordedAt: { type: Date, required: true, default: () => new Date() },
    recordedByUserId: { type: String, required: true },
  },
  { _id: false },
);

/**
 * The billable, schedulable unit of one OPD encounter. Links a queue
 * token to the clinical encounter and to its consultation invoice line
 * item (the invoice itself lives in billing/Invoice.model.ts — this only
 * holds the pointer so OPDVisit stays writable without a billing lock).
 */
export interface OPDVisitAttrs {
  visitNumber: string; // human-readable, e.g. "OPD-2026-000123"
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  queueTokenId: Types.ObjectId;
  departmentId: Types.ObjectId;
  visitDate: Date;
  chiefComplaint: string;
  vitals?: VitalSigns;
  isFollowUp: boolean;
  referredByDoctorId?: Types.ObjectId;
  clinicalNoteId?: Types.ObjectId; // ref -> emr/ClinicalNote once the doctor closes the encounter
  invoiceId?: Types.ObjectId; // ref -> billing/Invoice
  consultationFeeCharged: number;
  isFeeWaived: boolean;
  feeWaiverReason?: string;
  closedAt?: Date;
  createdBy: string;
}

export type OPDVisitDocument = HydratedDocument<OPDVisitAttrs>;

const OPDVisitSchema = new Schema<OPDVisitAttrs>(
  {
    visitNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    queueTokenId: { type: Schema.Types.ObjectId, ref: "OPDQueue", required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    visitDate: { type: Date, required: true },
    chiefComplaint: { type: String, required: true, trim: true, maxlength: 1000 },
    vitals: { type: VitalSignsSchema },
    isFollowUp: { type: Boolean, required: true, default: false },
    referredByDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor" },
    clinicalNoteId: { type: Schema.Types.ObjectId, ref: "ClinicalNote" },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    consultationFeeCharged: { type: Number, required: true, min: 0 },
    isFeeWaived: { type: Boolean, required: true, default: false },
    feeWaiverReason: { type: String, trim: true },
    closedAt: { type: Date },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "opd_visits" },
);

OPDVisitSchema.index({ patientId: 1, visitDate: -1 });
OPDVisitSchema.index({ doctorId: 1, visitDate: -1 });

export const OPDVisit: Model<OPDVisitAttrs> = model<OPDVisitAttrs>("OPDVisit", OPDVisitSchema);

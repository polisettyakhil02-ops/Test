import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { DialysisShift, DialysisSessionStatus, VascularAccessType } from "../../types/common.types.js";

/**
 * One dialysis session, linked to `Patient` and to the physical machine
 * via `machineAssetId` (an `Asset` with `category: DIALYSIS_MACHINE`, the
 * same biomedical registry Step 11 built — no separate "machine" model).
 * `scheduleDialysisSession` conflict-checks overlapping bookings on the
 * same machine before creating one, the identical double-booking guard
 * `OTService.scheduleSurgery` uses for theatre rooms. This document *is*
 * the Nephrology EMR's dialysis chart: pre/post weight, heparin dose, and
 * ultrafiltration volume all live here rather than on a parallel EMR
 * collection, since they only ever mean something in the context of one
 * specific session.
 */
export interface DialysisSessionAttrs {
  sessionNumber: string; // e.g. "DLS-2026-002210"
  patientId: Types.ObjectId;
  admissionId?: Types.ObjectId; // set when the patient is currently an inpatient; absent for chronic OPD dialysis
  machineAssetId: Types.ObjectId;
  nephrologistId: Types.ObjectId;
  technicianUserId: string;
  shift: DialysisShift;
  scheduledStart: Date;
  scheduledEnd: Date;
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
  startedByUserId?: string;
  cancellationReason?: string;
  cancelledByUserId?: string;
  createdBy: string;
}

export type DialysisSessionDocument = HydratedDocument<DialysisSessionAttrs>;

const DialysisSessionSchema = new Schema<DialysisSessionAttrs>(
  {
    sessionNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    machineAssetId: { type: Schema.Types.ObjectId, ref: "Asset", required: true, index: true },
    nephrologistId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    technicianUserId: { type: String, required: true },
    shift: { type: String, required: true, enum: Object.values(DialysisShift) },
    scheduledStart: { type: Date, required: true },
    scheduledEnd: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(DialysisSessionStatus),
      default: DialysisSessionStatus.SCHEDULED,
    },
    vascularAccessType: { type: String, required: true, enum: Object.values(VascularAccessType) },
    preDialysisWeightKg: { type: Number, required: true, min: 0, max: 400 },
    postDialysisWeightKg: { type: Number, min: 0, max: 400 },
    heparinDoseUnits: { type: Number, required: true, min: 0 },
    targetUltrafiltrationVolumeMl: { type: Number, required: true, min: 0 },
    actualUltrafiltrationVolumeMl: { type: Number, min: 0 },
    bloodFlowRateMlPerMin: { type: Number, min: 0 },
    dialysateFlowRateMlPerMin: { type: Number, min: 0 },
    durationMinutes: { type: Number, required: true, min: 1, max: 600 },
    preDialysisSystolicBP: { type: Number, min: 0, max: 300 },
    preDialysisDiastolicBP: { type: Number, min: 0, max: 200 },
    postDialysisSystolicBP: { type: Number, min: 0, max: 300 },
    postDialysisDiastolicBP: { type: Number, min: 0, max: 200 },
    complications: { type: String, trim: true, maxlength: 1000 },
    notes: { type: String, trim: true, maxlength: 1000 },
    startedByUserId: { type: String },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    cancelledByUserId: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "dialysis_sessions" },
);

// The scheduler grid's core query, and the conflict-check's index.
DialysisSessionSchema.index({ machineAssetId: 1, scheduledStart: 1 });
DialysisSessionSchema.index({ patientId: 1, scheduledStart: -1 });
DialysisSessionSchema.index({ status: 1, scheduledStart: 1 });

export const DialysisSession: Model<DialysisSessionAttrs> = model<DialysisSessionAttrs>(
  "DialysisSession",
  DialysisSessionSchema,
);

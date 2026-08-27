import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import type { VitalSigns } from "../../types/common.types.js";

/**
 * Periodic ward-round vitals for an admitted patient — distinct from the
 * one-off `OPDVisit.vitals` snapshot. High write volume (every few hours
 * per bed) so this is a narrow, append-only, time-series-shaped
 * collection rather than an embedded array on Admission.
 */
export interface VitalsLogAttrs {
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  bedId: Types.ObjectId;
  vitals: VitalSigns;
  isAbnormal: boolean; // set by the recording nurse or a threshold rule, drives the ward dashboard alert badge
  abnormalFlags: string[]; // e.g. ["HIGH_TEMP", "LOW_SPO2"]
  recordedByUserId: string;
}

export type VitalsLogDocument = HydratedDocument<VitalsLogAttrs>;

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

const VitalsLogSchema = new Schema<VitalsLogAttrs>(
  {
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    bedId: { type: Schema.Types.ObjectId, ref: "Bed", required: true },
    vitals: { type: VitalSignsSchema, required: true },
    isAbnormal: { type: Boolean, required: true, default: false },
    abnormalFlags: { type: [String], default: [] },
    recordedByUserId: { type: String, required: true },
  },
  { timestamps: true, collection: "vitals_logs" },
);

// Nurse station's "latest vitals per admission" and abnormal-alert feed.
VitalsLogSchema.index({ admissionId: 1, "vitals.recordedAt": -1 });
VitalsLogSchema.index({ isAbnormal: 1, "vitals.recordedAt": -1 });

export const VitalsLog: Model<VitalsLogAttrs> = model<VitalsLogAttrs>("VitalsLog", VitalsLogSchema);

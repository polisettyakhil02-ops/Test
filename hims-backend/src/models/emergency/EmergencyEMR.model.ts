import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { AirwayStatus } from "../../types/common.types.js";

/**
 * A rapid primary-assessment record using the standard ABCDE
 * (Airway/Breathing/Circulation/Disability/Exposure) trauma/resuscitation
 * framework. One `ERVisit` can accumulate several of these over time as
 * the patient is reassessed — append-only, same pattern as `ClinicalNote`
 * and `VitalsLog` — so the sequence itself is the resuscitation timeline,
 * never edited or overwritten in place.
 */
export interface EmergencyEMRAttrs {
  erVisitId: Types.ObjectId;
  patientId: Types.ObjectId;
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
  disabilityGcsScore?: number; // 3-15 (Glasgow Coma Scale)
  disabilityPupilResponse?: string;
  disabilityNotes?: string;
  exposureNotes?: string; // temperature, exposed injuries, environmental findings
  overallImpression?: string;
  recordedByUserId: string;
  recordedAt: Date;
}

export type EmergencyEMRDocument = HydratedDocument<EmergencyEMRAttrs>;

const EmergencyEMRSchema = new Schema<EmergencyEMRAttrs>(
  {
    erVisitId: { type: Schema.Types.ObjectId, ref: "ERVisit", required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    airwayStatus: { type: String, required: true, enum: Object.values(AirwayStatus) },
    airwayNotes: { type: String, trim: true, maxlength: 500 },
    breathingRatePerMin: { type: Number, min: 0, max: 100 },
    breathingSpo2Percent: { type: Number, min: 0, max: 100 },
    breathingNotes: { type: String, trim: true, maxlength: 500 },
    circulationPulseRatePerMin: { type: Number, min: 0, max: 300 },
    circulationSystolicBP: { type: Number, min: 0, max: 300 },
    circulationDiastolicBP: { type: Number, min: 0, max: 200 },
    circulationCapillaryRefillSec: { type: Number, min: 0, max: 30 },
    circulationNotes: { type: String, trim: true, maxlength: 500 },
    disabilityGcsScore: { type: Number, min: 3, max: 15 },
    disabilityPupilResponse: { type: String, trim: true, maxlength: 200 },
    disabilityNotes: { type: String, trim: true, maxlength: 500 },
    exposureNotes: { type: String, trim: true, maxlength: 500 },
    overallImpression: { type: String, trim: true, maxlength: 1000 },
    recordedByUserId: { type: String, required: true },
    recordedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, collection: "emergency_emr_entries" },
);

EmergencyEMRSchema.index({ erVisitId: 1, recordedAt: 1 });

export const EmergencyEMR: Model<EmergencyEMRAttrs> = model<EmergencyEMRAttrs>("EmergencyEMR", EmergencyEMRSchema);

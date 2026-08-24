import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { VaccinationDoseStatus } from "../../types/common.types.js";

/** One dose on the child's immunization schedule — seeded from `STANDARD_IMMUNIZATION_SCHEDULE` at record creation, then updated in place as each dose is given. */
export interface VaccinationDose {
  vaccineName: string;
  doseNumber: number;
  dueDate: Date;
  administeredDate?: Date;
  batchNumber?: string;
  administeredByUserId?: string;
  status: VaccinationDoseStatus;
}

/** One WHO growth-chart measurement — weight, height, and head circumference tracked together since they're recorded at the same well-child visit. */
export interface GrowthChartEntry {
  recordedAt: Date;
  ageInMonths: number; // derived from the patient's dateOfBirth at recording time, snapshotted so the chart's x-axis never shifts if re-read later
  weightKg: number;
  heightCm: number;
  headCircumferenceCm?: number;
  recordedByUserId: string;
}

/**
 * The Pediatric EMR: one record per child, accumulating vaccination doses
 * and growth measurements over the course of well-child visits — the same
 * "one growing document per care episode" shape `ObstetricRecord` and
 * `IvfCycle` already use, since both sub-schemas are strictly append-only
 * time series read together as one chart.
 */
export interface PediatricRecordAttrs {
  recordNumber: string; // e.g. "PED-2026-000045"
  patientId: Types.ObjectId;
  pediatricianId: Types.ObjectId; // ref -> Doctor
  vaccinationSchedule: VaccinationDose[];
  growthChartEntries: GrowthChartEntry[];
  allergyNotes?: string;
  createdBy: string;
}

export type PediatricRecordDocument = HydratedDocument<PediatricRecordAttrs>;

const VaccinationDoseSchema = new Schema<VaccinationDose>(
  {
    vaccineName: { type: String, required: true, trim: true },
    doseNumber: { type: Number, required: true, min: 1 },
    dueDate: { type: Date, required: true },
    administeredDate: { type: Date },
    batchNumber: { type: String, trim: true },
    administeredByUserId: { type: String },
    status: { type: String, required: true, enum: Object.values(VaccinationDoseStatus), default: VaccinationDoseStatus.DUE },
  },
  { _id: false },
);

const GrowthChartEntrySchema = new Schema<GrowthChartEntry>(
  {
    recordedAt: { type: Date, required: true },
    ageInMonths: { type: Number, required: true, min: 0 },
    weightKg: { type: Number, required: true, min: 0, max: 200 },
    heightCm: { type: Number, required: true, min: 0, max: 250 },
    headCircumferenceCm: { type: Number, min: 0, max: 100 },
    recordedByUserId: { type: String, required: true },
  },
  { _id: false },
);

const PediatricRecordSchema = new Schema<PediatricRecordAttrs>(
  {
    recordNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, unique: true, index: true },
    pediatricianId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    vaccinationSchedule: { type: [VaccinationDoseSchema], default: [] },
    growthChartEntries: { type: [GrowthChartEntrySchema], default: [] },
    allergyNotes: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "pediatric_records" },
);

export const PediatricRecord: Model<PediatricRecordAttrs> = model<PediatricRecordAttrs>(
  "PediatricRecord",
  PediatricRecordSchema,
);

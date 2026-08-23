import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";

export interface DischargeMedication {
  drugId: Types.ObjectId;
  drugName: string; // denormalized snapshot at time of discharge
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}

export interface DischargeSummaryAttrs {
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  attendingDoctorId: Types.ObjectId;
  admissionDate: Date;
  dischargeDate: Date;
  dischargeType: "ROUTINE" | "LAMA" | "DAMA" | "TRANSFER_OUT" | "DECEASED";
  presentingComplaints: string;
  historyOfPresentIllness: string;
  courseInHospital: string;
  proceduresPerformed: string[];
  finalDiagnosis: string;
  icd10Codes: string[];
  conditionAtDischarge: "STABLE" | "IMPROVED" | "UNCHANGED" | "CRITICAL" | "DECEASED";
  dischargeMedications: DischargeMedication[];
  followUpInstructions: string;
  followUpDate?: Date;
  dietaryAdvice?: string;
  activityRestrictions?: string;
  signedByDoctorId: Types.ObjectId;
  signedAt?: Date;
  isFinalized: boolean;
  pdfStorageKey?: string;
  createdBy: string;
}

export type DischargeSummaryDocument = HydratedDocument<DischargeSummaryAttrs>;

const DischargeMedicationSchema = new Schema<DischargeMedication>(
  {
    drugId: { type: Schema.Types.ObjectId, ref: "Drug", required: true },
    drugName: { type: String, required: true },
    dosage: { type: String, required: true },
    frequency: { type: String, required: true },
    durationDays: { type: Number, required: true, min: 1 },
    instructions: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const DischargeSummarySchema = new Schema<DischargeSummaryAttrs>(
  {
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: true, unique: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    attendingDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    admissionDate: { type: Date, required: true },
    dischargeDate: { type: Date, required: true },
    dischargeType: {
      type: String,
      required: true,
      enum: ["ROUTINE", "LAMA", "DAMA", "TRANSFER_OUT", "DECEASED"],
    },
    presentingComplaints: { type: String, required: true },
    historyOfPresentIllness: { type: String, required: true },
    courseInHospital: { type: String, required: true },
    proceduresPerformed: { type: [String], default: [] },
    finalDiagnosis: { type: String, required: true },
    icd10Codes: { type: [String], default: [] },
    conditionAtDischarge: {
      type: String,
      required: true,
      enum: ["STABLE", "IMPROVED", "UNCHANGED", "CRITICAL", "DECEASED"],
    },
    dischargeMedications: { type: [DischargeMedicationSchema], default: [] },
    followUpInstructions: { type: String, required: true },
    followUpDate: { type: Date },
    dietaryAdvice: { type: String, trim: true },
    activityRestrictions: { type: String, trim: true },
    signedByDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    signedAt: { type: Date },
    // Once finalized, application-layer authorization must forbid further
    // edits (immutability enforced in the service layer, not schema-level,
    // since a correction workflow still needs a controlled amendment path).
    isFinalized: { type: Boolean, required: true, default: false },
    pdfStorageKey: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "discharge_summaries" },
);

DischargeSummarySchema.index({ patientId: 1, dischargeDate: -1 });

export const DischargeSummary: Model<DischargeSummaryAttrs> = model<DischargeSummaryAttrs>(
  "DischargeSummary",
  DischargeSummarySchema,
);

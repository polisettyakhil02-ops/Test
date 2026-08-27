import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { ICD10_CODE_REGEX } from "../../types/common.types.js";

export interface DiagnosisAttrs {
  patientId: Types.ObjectId;
  clinicalNoteId: Types.ObjectId;
  icd10Code: string;
  icd10Description: string;
  diagnosisType: "PROVISIONAL" | "CONFIRMED" | "DIFFERENTIAL" | "RULED_OUT";
  isChronic: boolean;
  isPrimary: boolean;
  diagnosedByDoctorId: Types.ObjectId;
  diagnosedAt: Date;
  notes?: string;
  resolvedAt?: Date;
}

export type DiagnosisDocument = HydratedDocument<DiagnosisAttrs>;

const DiagnosisSchema = new Schema<DiagnosisAttrs>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    clinicalNoteId: { type: Schema.Types.ObjectId, ref: "ClinicalNote", required: true },
    icd10Code: { type: String, required: true, uppercase: true, trim: true, match: ICD10_CODE_REGEX },
    icd10Description: { type: String, required: true, trim: true },
    diagnosisType: {
      type: String,
      required: true,
      enum: ["PROVISIONAL", "CONFIRMED", "DIFFERENTIAL", "RULED_OUT"],
    },
    isChronic: { type: Boolean, required: true, default: false },
    isPrimary: { type: Boolean, required: true, default: false },
    diagnosedByDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    diagnosedAt: { type: Date, required: true, default: () => new Date() },
    notes: { type: String, trim: true, maxlength: 1000 },
    resolvedAt: { type: Date },
  },
  { timestamps: true, collection: "diagnoses" },
);

DiagnosisSchema.index({ patientId: 1, isChronic: 1 });
DiagnosisSchema.index({ icd10Code: 1 });

export const Diagnosis: Model<DiagnosisAttrs> = model<DiagnosisAttrs>("Diagnosis", DiagnosisSchema);

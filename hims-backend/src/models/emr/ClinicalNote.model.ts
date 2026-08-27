import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { EncounterType } from "../../types/common.types.js";

/**
 * SOAP-structured clinical note. Exactly one of `opdVisitId` /
 * `admissionId` is set depending on `encounterType` — enforced in
 * `pre("validate")` below rather than with a discriminator, since the
 * note shape itself does not vary between OPD and IPD encounters.
 */
export interface ClinicalNoteAttrs {
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  encounterType: EncounterType;
  opdVisitId?: Types.ObjectId;
  admissionId?: Types.ObjectId;
  encounterDate: Date;
  subjective: string; // patient-reported symptoms/history
  objective: string; // exam findings (vitals are captured separately in VitalSigns)
  assessment: string; // clinical assessment narrative
  plan: string; // treatment plan narrative
  diagnosisIds: Types.ObjectId[]; // ref -> Diagnosis
  prescriptionIds: Types.ObjectId[]; // ref -> Prescription
  labOrderIds: Types.ObjectId[]; // ref -> LIMS LabOrder
  allergyCheckAcknowledged: boolean; // doctor explicitly reviewed allergy alerts before signing
  isSigned: boolean;
  signedAt?: Date;
  addendumOf?: Types.ObjectId; // set when this note amends a prior signed note (notes are append-only once signed)
  createdBy: string;
}

export type ClinicalNoteDocument = HydratedDocument<ClinicalNoteAttrs>;

const ClinicalNoteSchema = new Schema<ClinicalNoteAttrs>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    encounterType: { type: String, required: true, enum: Object.values(EncounterType) },
    opdVisitId: { type: Schema.Types.ObjectId, ref: "OPDVisit" },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    encounterDate: { type: Date, required: true, default: () => new Date() },
    subjective: { type: String, required: true },
    objective: { type: String, required: true },
    assessment: { type: String, required: true },
    plan: { type: String, required: true },
    diagnosisIds: { type: [Schema.Types.ObjectId], ref: "Diagnosis", default: [] },
    prescriptionIds: { type: [Schema.Types.ObjectId], ref: "Prescription", default: [] },
    labOrderIds: { type: [Schema.Types.ObjectId], ref: "LabOrder", default: [] },
    allergyCheckAcknowledged: { type: Boolean, required: true, default: false },
    isSigned: { type: Boolean, required: true, default: false },
    signedAt: { type: Date },
    addendumOf: { type: Schema.Types.ObjectId, ref: "ClinicalNote" },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "clinical_notes" },
);

ClinicalNoteSchema.pre("validate", function preValidate(next) {
  const hasOPD = Boolean(this.opdVisitId);
  const hasIPD = Boolean(this.admissionId);
  if (hasOPD === hasIPD) {
    next(new Error("Exactly one of opdVisitId or admissionId must be set"));
    return;
  }
  next();
});

// Patient's chronological medical timeline is the dominant read pattern.
ClinicalNoteSchema.index({ patientId: 1, encounterDate: -1 });
ClinicalNoteSchema.index({ doctorId: 1, encounterDate: -1 });

export const ClinicalNote: Model<ClinicalNoteAttrs> = model<ClinicalNoteAttrs>(
  "ClinicalNote",
  ClinicalNoteSchema,
);

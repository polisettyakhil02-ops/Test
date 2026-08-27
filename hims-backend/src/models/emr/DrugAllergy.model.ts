import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { AllergySeverity } from "../../types/common.types.js";

/**
 * Source of truth for the allergy-alert engine consulted synchronously
 * before every Prescription save (see Prescription.model.ts pre-save
 * guard). `Patient.knownAllergySummary` is a denormalized cache of this
 * collection for fast list-view rendering only — never write logic
 * against it.
 */
export interface DrugAllergyAttrs {
  patientId: Types.ObjectId;
  allergen: string; // drug name or ingredient/class, e.g. "Penicillin"
  drugId?: Types.ObjectId; // set when the allergen maps to a specific Drug master entry
  reaction: string; // e.g. "Anaphylaxis", "Rash"
  severity: AllergySeverity;
  onsetDate?: Date;
  reportedByUserId: string;
  verifiedByDoctorId?: Types.ObjectId;
  isActive: boolean;
  notes?: string;
}

export type DrugAllergyDocument = HydratedDocument<DrugAllergyAttrs>;

const DrugAllergySchema = new Schema<DrugAllergyAttrs>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    allergen: { type: String, required: true, trim: true },
    drugId: { type: Schema.Types.ObjectId, ref: "Drug" },
    reaction: { type: String, required: true, trim: true },
    severity: { type: String, required: true, enum: Object.values(AllergySeverity) },
    onsetDate: { type: Date },
    reportedByUserId: { type: String, required: true },
    verifiedByDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor" },
    isActive: { type: Boolean, required: true, default: true },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: "drug_allergies" },
);

// The allergy-check pre-save hook on Prescription queries exactly this shape.
DrugAllergySchema.index({ patientId: 1, isActive: 1 });
DrugAllergySchema.index({ patientId: 1, drugId: 1 }, { sparse: true });

export const DrugAllergy: Model<DrugAllergyAttrs> = model<DrugAllergyAttrs>(
  "DrugAllergy",
  DrugAllergySchema,
);

import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { DrugRoute, PrescriptionStatus } from "../../types/common.types.js";
import { DrugAllergy } from "./DrugAllergy.model.js";

/**
 * One prescribed line item. `doseValue`/`doseUnit`/`frequencyPerDay`/
 * `durationDays` are the structured inputs the dosage calculator (and the
 * pharmacy dispensation engine's auto-deduct quantity math) consume;
 * `computedTotalQuantity` is derived and stored at prescribe-time so a
 * later change to the drug's packaging doesn't retroactively change what
 * was already ordered.
 */
export interface PrescriptionItem {
  _id: Types.ObjectId;
  drugId: Types.ObjectId;
  drugName: string; // denormalized snapshot
  doseValue: number;
  doseUnit: "mg" | "mcg" | "g" | "ml" | "IU" | "tablet" | "drop" | "puff";
  route: DrugRoute;
  frequencyPerDay: number;
  durationDays: number;
  isPRN: boolean; // "as needed" rather than scheduled
  instructions?: string; // e.g. "after food"
  computedTotalQuantity: number;
  quantityDispensed: number;
  itemStatus: PrescriptionStatus;
}

export interface PrescriptionAttrs {
  prescriptionNumber: string;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  clinicalNoteId: Types.ObjectId;
  encounterType: "OPD" | "IPD";
  items: PrescriptionItem[];
  status: PrescriptionStatus;
  allergyOverride: boolean; // true if doctor explicitly overrode an allergy alert
  allergyOverrideReason?: string;
  prescribedAt: Date;
  createdBy: string;
}

export type PrescriptionDocument = HydratedDocument<PrescriptionAttrs>;

const PrescriptionItemSchema = new Schema<PrescriptionItem>(
  {
    drugId: { type: Schema.Types.ObjectId, ref: "Drug", required: true },
    drugName: { type: String, required: true },
    doseValue: { type: Number, required: true, min: 0 },
    doseUnit: {
      type: String,
      required: true,
      enum: ["mg", "mcg", "g", "ml", "IU", "tablet", "drop", "puff"],
    },
    route: { type: String, required: true, enum: Object.values(DrugRoute) },
    frequencyPerDay: { type: Number, required: true, min: 1, max: 24 },
    durationDays: { type: Number, required: true, min: 1 },
    isPRN: { type: Boolean, required: true, default: false },
    instructions: { type: String, trim: true, maxlength: 300 },
    computedTotalQuantity: { type: Number, required: true, min: 0 },
    quantityDispensed: { type: Number, required: true, default: 0, min: 0 },
    itemStatus: {
      type: String,
      required: true,
      enum: Object.values(PrescriptionStatus),
      default: PrescriptionStatus.ORDERED,
    },
  },
  { _id: true },
);

const PrescriptionSchema = new Schema<PrescriptionAttrs>(
  {
    prescriptionNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    clinicalNoteId: { type: Schema.Types.ObjectId, ref: "ClinicalNote", required: true },
    encounterType: { type: String, required: true, enum: ["OPD", "IPD"] },
    items: {
      type: [PrescriptionItemSchema],
      validate: { validator: (v: PrescriptionItem[]) => v.length > 0, message: "At least one item is required" },
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(PrescriptionStatus),
      default: PrescriptionStatus.ORDERED,
    },
    allergyOverride: { type: Boolean, required: true, default: false },
    allergyOverrideReason: { type: String, trim: true, maxlength: 500 },
    prescribedAt: { type: Date, required: true, default: () => new Date() },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "prescriptions" },
);

PrescriptionSchema.index({ patientId: 1, prescribedAt: -1 });
PrescriptionSchema.index({ status: 1 });

/**
 * Hard-stop guard: refuses to save a prescription containing a drug the
 * patient has an active allergy to, unless the doctor has recorded an
 * explicit override + reason. This is the last line of defense in code —
 * the UI is expected to surface the same alert before the doctor ever
 * reaches submit.
 */
PrescriptionSchema.pre("validate", async function preValidate(next) {
  if (this.allergyOverride) {
    next();
    return;
  }
  const drugIds = this.items.map((item) => item.drugId);
  const activeAllergies = await DrugAllergy.find({
    patientId: this.patientId,
    isActive: true,
    drugId: { $in: drugIds },
  })
    .select("drugId allergen")
    // Threads through the session `save({ session })` associated with this
    // document (e.g. from within PharmacyService's transaction) so the
    // check reads with the same snapshot rather than a separate, unrelated
    // implicit session.
    .session(this.$session())
    .lean();

  if (activeAllergies.length > 0) {
    const allergens = activeAllergies.map((a) => a.allergen).join(", ");
    next(new Error(`Patient has an active allergy to: ${allergens}. Set allergyOverride with a reason to proceed.`));
    return;
  }
  next();
});

export const Prescription: Model<PrescriptionAttrs> = model<PrescriptionAttrs>(
  "Prescription",
  PrescriptionSchema,
);

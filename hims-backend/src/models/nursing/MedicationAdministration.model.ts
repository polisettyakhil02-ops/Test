import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";

export enum MARStatus {
  DUE = "DUE",
  ADMINISTERED = "ADMINISTERED",
  MISSED = "MISSED",
  REFUSED = "REFUSED",
  HELD = "HELD",
}

/**
 * The Medication Administration Record: one document per scheduled dose
 * of a prescribed item, generated when a Prescription is signed (one row
 * per `frequencyPerDay` x `durationDays` occurrence for non-PRN items).
 * This is what the nurse station's MAR grid reads and writes — never the
 * Prescription document itself, which stays the immutable order record.
 */
export interface MedicationAdministrationAttrs {
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  prescriptionItemId: Types.ObjectId;
  drugName: string;
  doseDescription: string; // denormalized human-readable dose, e.g. "500mg PO"
  scheduledAt: Date;
  status: MARStatus;
  administeredAt?: Date;
  administeredByUserId?: string;
  witnessedByUserId?: string; // second-signature for controlled substances
  variancNote?: string; // required when status is MISSED / REFUSED / HELD
  batchId?: Types.ObjectId; // ref -> pharmacy/DrugBatch, the specific dispensed batch administered
}

export type MedicationAdministrationDocument = HydratedDocument<MedicationAdministrationAttrs>;

const MedicationAdministrationSchema = new Schema<MedicationAdministrationAttrs>(
  {
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    prescriptionId: { type: Schema.Types.ObjectId, ref: "Prescription", required: true },
    prescriptionItemId: { type: Schema.Types.ObjectId, required: true },
    drugName: { type: String, required: true },
    doseDescription: { type: String, required: true },
    scheduledAt: { type: Date, required: true },
    status: { type: String, required: true, enum: Object.values(MARStatus), default: MARStatus.DUE },
    administeredAt: { type: Date },
    administeredByUserId: { type: String },
    witnessedByUserId: { type: String },
    variancNote: { type: String, trim: true, maxlength: 500 },
    batchId: { type: Schema.Types.ObjectId, ref: "DrugBatch" },
  },
  { timestamps: true, collection: "medication_administrations" },
);

MedicationAdministrationSchema.pre("validate", function preValidate(next) {
  const requiresNote = ["MISSED", "REFUSED", "HELD"].includes(this.status);
  if (requiresNote && !this.variancNote) {
    next(new Error(`variancNote is required when status is ${this.status}`));
    return;
  }
  next();
});

// The MAR board's dominant query: "what's due for this admission, in time order".
MedicationAdministrationSchema.index({ admissionId: 1, scheduledAt: 1 });
MedicationAdministrationSchema.index({ status: 1, scheduledAt: 1 });

export const MedicationAdministration: Model<MedicationAdministrationAttrs> =
  model<MedicationAdministrationAttrs>("MedicationAdministration", MedicationAdministrationSchema);

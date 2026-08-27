import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { SpecimenStatus } from "../../types/common.types.js";

/**
 * One physical sample tube/container, barcoded at collection time. A
 * single LabOrder with multiple tests sharing one draw (e.g. CBC + ESR
 * from one EDTA tube) can reference the same Specimen from multiple
 * `LabOrderTestLine.specimenId` values.
 */
export interface SpecimenAttrs {
  barcodeValue: string;
  labOrderId: Types.ObjectId;
  patientId: Types.ObjectId;
  specimenType: string;
  containerType: string;
  status: SpecimenStatus;
  collectedAt?: Date;
  collectedByUserId?: string;
  receivedAt?: Date;
  receivedByUserId?: string;
  rejectionReason?: string;
  storageLocation?: string;
}

export type SpecimenDocument = HydratedDocument<SpecimenAttrs>;

const SpecimenSchema = new Schema<SpecimenAttrs>(
  {
    barcodeValue: { type: String, required: true, unique: true },
    labOrderId: { type: Schema.Types.ObjectId, ref: "LabOrder", required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    specimenType: { type: String, required: true },
    containerType: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(SpecimenStatus),
      default: SpecimenStatus.PENDING_COLLECTION,
    },
    collectedAt: { type: Date },
    collectedByUserId: { type: String },
    receivedAt: { type: Date },
    receivedByUserId: { type: String },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    storageLocation: { type: String, trim: true },
  },
  { timestamps: true, collection: "specimens" },
);

SpecimenSchema.index({ status: 1, createdAt: 1 });

export const Specimen: Model<SpecimenAttrs> = model<SpecimenAttrs>("Specimen", SpecimenSchema);

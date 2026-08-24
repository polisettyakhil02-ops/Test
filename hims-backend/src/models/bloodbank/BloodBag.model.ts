import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { BloodGroup, BloodComponentType, BloodBagStatus } from "../../types/common.types.js";

/**
 * One collected/processed unit. `expiryDate` is computed at creation time
 * by `bloodbank.service.ts#logDonation` from the component's shelf life
 * (whole blood/PRBC 35 days, platelets 5 days, FFP/cryoprecipitate ~1
 * year frozen) rather than left for callers to compute — the dispensing
 * guard (`dispenseBloodBag`) trusts this field directly. `status` and
 * `expiryDate` are both checked at dispense time rather than relying on a
 * background job to flip AVAILABLE -> EXPIRED, since a cron running late
 * must never be the reason an expired unit gets issued.
 */
export interface BloodBagAttrs {
  bagNumber: string; // unique barcode, e.g. "BAG-2026-000512"
  donorId: Types.ObjectId;
  bloodGroup: BloodGroup;
  componentType: BloodComponentType;
  volumeMl: number;
  collectionDate: Date;
  expiryDate: Date;
  screeningTestsPassed: boolean; // HIV/HBV/HCV/Syphilis/Malaria panel
  status: BloodBagStatus;
  storageLocation: string; // e.g. "Fridge 2, Shelf B"
  issuedToAdmissionId?: Types.ObjectId;
  issuedAt?: Date;
  issuedByUserId?: string;
  discardReason?: string;
  createdBy: string;
}

export type BloodBagDocument = HydratedDocument<BloodBagAttrs>;

const BloodBagSchema = new Schema<BloodBagAttrs>(
  {
    bagNumber: { type: String, required: true, unique: true, immutable: true },
    donorId: { type: Schema.Types.ObjectId, ref: "BloodDonor", required: true, index: true },
    bloodGroup: { type: String, required: true, enum: Object.values(BloodGroup) },
    componentType: { type: String, required: true, enum: Object.values(BloodComponentType) },
    volumeMl: { type: Number, required: true, min: 1 },
    collectionDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    screeningTestsPassed: { type: Boolean, required: true, default: false },
    status: { type: String, required: true, enum: Object.values(BloodBagStatus), default: BloodBagStatus.AVAILABLE },
    storageLocation: { type: String, required: true, trim: true },
    issuedToAdmissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    issuedAt: { type: Date },
    issuedByUserId: { type: String },
    discardReason: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "blood_bags", optimisticConcurrency: true },
);

// Inventory-by-blood-group-and-component is the bank's primary read.
BloodBagSchema.index({ bloodGroup: 1, componentType: 1, status: 1 });
BloodBagSchema.index({ expiryDate: 1 });

export const BloodBag: Model<BloodBagAttrs> = model<BloodBagAttrs>("BloodBag", BloodBagSchema);

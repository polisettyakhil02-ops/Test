import { Schema, model, type Model, type HydratedDocument } from "mongoose";
import { BloodGroup, Gender, PHONE_REGEX } from "../../types/common.types.js";

/**
 * A registered blood donor, tracked independently of `Patient` (MPI) — a
 * donor is frequently not a patient at all, and even when they are, donor
 * eligibility/donation history is its own record type, not clinical
 * history. `totalDonations`/`lastDonationDate` are denormalized onto this
 * document (updated by `bloodbank.service.ts#logDonation`) so a donor
 * camp roster can render "eligible to donate again" without a fan-out
 * query across every `BloodBag` ever collected from them.
 */
export interface BloodDonorAttrs {
  donorCode: string; // e.g. "DON-2026-000042"
  fullName: string;
  age: number;
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  address?: string;
  lastDonationDate?: Date;
  totalDonations: number;
  isEligible: boolean;
  ineligibilityReason?: string;
  medicalNotes?: string;
  createdBy: string;
}

export type BloodDonorDocument = HydratedDocument<BloodDonorAttrs>;

const BloodDonorSchema = new Schema<BloodDonorAttrs>(
  {
    donorCode: { type: String, required: true, unique: true, immutable: true },
    fullName: { type: String, required: true, trim: true, maxlength: 150 },
    age: { type: Number, required: true, min: 18, max: 65 },
    gender: { type: String, required: true, enum: Object.values(Gender) },
    bloodGroup: { type: String, required: true, enum: Object.values(BloodGroup) },
    phone: { type: String, required: true, trim: true, match: PHONE_REGEX, index: true },
    address: { type: String, trim: true, maxlength: 300 },
    lastDonationDate: { type: Date },
    totalDonations: { type: Number, required: true, default: 0, min: 0 },
    isEligible: { type: Boolean, required: true, default: true },
    ineligibilityReason: { type: String, trim: true, maxlength: 500 },
    medicalNotes: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "blood_donors" },
);

BloodDonorSchema.index({ bloodGroup: 1, isEligible: 1 });

export const BloodDonor: Model<BloodDonorAttrs> = model<BloodDonorAttrs>("BloodDonor", BloodDonorSchema);

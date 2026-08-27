import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { PayerType } from "../../types/common.types.js";

/**
 * Normalized insurer/TPA + policy record referenced by Invoice and
 * PreAuthorization. `Patient.insuranceDetails` (embedded) remains the
 * quick-glance demographic capture at registration; this collection is
 * the billing-side source of truth once a policy is actually used for a
 * claim, and is where TPA claim-workflow fields live.
 */
export interface InsurancePolicyAttrs {
  patientId: Types.ObjectId;
  payerType: PayerType;
  insurerName: string;
  tpaName?: string;
  policyNumber: string;
  groupNumber?: string;
  sumInsured: number;
  sumUtilized: number;
  validFrom: Date;
  validTo: Date;
  policyHolderRelationship: "SELF" | "SPOUSE" | "CHILD" | "PARENT" | "OTHER";
  isActive: boolean;
  cardStorageKey?: string;
}

export type InsurancePolicyDocument = HydratedDocument<InsurancePolicyAttrs>;

const InsurancePolicySchema = new Schema<InsurancePolicyAttrs>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    payerType: { type: String, required: true, enum: Object.values(PayerType) },
    insurerName: { type: String, required: true, trim: true },
    tpaName: { type: String, trim: true },
    policyNumber: { type: String, required: true, trim: true },
    groupNumber: { type: String, trim: true },
    sumInsured: { type: Number, required: true, min: 0 },
    sumUtilized: { type: Number, required: true, default: 0, min: 0 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    policyHolderRelationship: { type: String, required: true, enum: ["SELF", "SPOUSE", "CHILD", "PARENT", "OTHER"] },
    isActive: { type: Boolean, required: true, default: true },
    cardStorageKey: { type: String },
  },
  { timestamps: true, collection: "insurance_policies" },
);

InsurancePolicySchema.index({ patientId: 1, isActive: 1 });
InsurancePolicySchema.index({ policyNumber: 1, insurerName: 1 });

export const InsurancePolicy: Model<InsurancePolicyAttrs> = model<InsurancePolicyAttrs>(
  "InsurancePolicy",
  InsurancePolicySchema,
);

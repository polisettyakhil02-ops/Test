import { Schema, model, type Model, type HydratedDocument } from "mongoose";
import { DoctorEmploymentType, RevenueCategory } from "../../types/common.types.js";

/**
 * The configurable (resource → percentage) lookup `PayrollService` reads
 * to turn gross billed revenue into a doctor's cut — deliberately its own
 * collection, editable without a code change, mirroring how
 * `TariffMaster` decouples pricing from the services that charge it and
 * `Role.permissions` decouples grants from the middleware that checks
 * them. Keyed on (employmentType, revenueCategory): at most one *active*
 * rule may exist per combination at a time — `PayrollService` always
 * takes the highest-`effectiveFrom` active match, so a rate change is a
 * new row, not a mutation of history (past payout statements must keep
 * reading the rate that was actually in effect when they were generated).
 */
export interface RevenueShareRuleAttrs {
  employmentType: DoctorEmploymentType;
  revenueCategory: RevenueCategory;
  sharePercent: number; // 0-100, the doctor's cut of the gross line-item amount
  effectiveFrom: Date;
  effectiveTo?: Date;
  isActive: boolean;
  notes?: string;
}

export type RevenueShareRuleDocument = HydratedDocument<RevenueShareRuleAttrs>;

const RevenueShareRuleSchema = new Schema<RevenueShareRuleAttrs>(
  {
    employmentType: { type: String, required: true, enum: Object.values(DoctorEmploymentType) },
    revenueCategory: { type: String, required: true, enum: Object.values(RevenueCategory) },
    sharePercent: { type: Number, required: true, min: 0, max: 100 },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
    isActive: { type: Boolean, required: true, default: true },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: "revenue_share_rules" },
);

RevenueShareRuleSchema.index({ employmentType: 1, revenueCategory: 1, isActive: 1, effectiveFrom: -1 });

export const RevenueShareRule: Model<RevenueShareRuleAttrs> = model<RevenueShareRuleAttrs>(
  "RevenueShareRule",
  RevenueShareRuleSchema,
);

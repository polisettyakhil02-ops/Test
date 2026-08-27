import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { DoctorEmploymentType, RevenueCategory, PayoutStatus } from "../../types/common.types.js";

/** One billed encounter's contribution to a doctor's payout — always traceable back to the exact Invoice line item it was computed from. */
export interface PayoutStatementLine {
  invoiceId: Types.ObjectId;
  invoiceLineItemId: Types.ObjectId;
  sourceType: "OPD_VISIT" | "OT_SCHEDULE";
  sourceId: Types.ObjectId;
  description: string;
  serviceDate: Date;
  revenueCategory: RevenueCategory;
  grossAmount: number;
  sharePercent: number;
  doctorShare: number;
}

/**
 * A generated monthly revenue-share statement for one doctor — the
 * durable, re-readable record `PayrollService.generateMonthlyPayoutStatement`
 * produces and `finalizePayout` locks. Kept as a real persisted document
 * (not a read-time-only aggregation response) for the same reason
 * `Invoice` stores computed totals: once finalized, a statement must
 * keep showing the numbers that were actually paid out even if the
 * underlying RevenueShareRule percentages change later.
 */
export interface PayoutStatementAttrs {
  statementNumber: string;
  doctorId: Types.ObjectId;
  employmentTypeAtGeneration: DoctorEmploymentType;
  periodYear: number;
  periodMonth: number; // 1-12
  lines: PayoutStatementLine[];
  totalGrossAmount: number;
  totalPayoutAmount: number;
  status: PayoutStatus;
  generatedAt: Date;
  generatedByUserId: string;
  finalizedAt?: Date;
  finalizedByUserId?: string;
}

export type PayoutStatementDocument = HydratedDocument<PayoutStatementAttrs>;

const PayoutStatementLineSchema = new Schema<PayoutStatementLine>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
    invoiceLineItemId: { type: Schema.Types.ObjectId, required: true },
    sourceType: { type: String, required: true, enum: ["OPD_VISIT", "OT_SCHEDULE"] },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    description: { type: String, required: true },
    serviceDate: { type: Date, required: true },
    revenueCategory: { type: String, required: true, enum: Object.values(RevenueCategory) },
    grossAmount: { type: Number, required: true, min: 0 },
    sharePercent: { type: Number, required: true, min: 0, max: 100 },
    doctorShare: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const PayoutStatementSchema = new Schema<PayoutStatementAttrs>(
  {
    statementNumber: { type: String, required: true, unique: true, immutable: true },
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    employmentTypeAtGeneration: { type: String, required: true, enum: Object.values(DoctorEmploymentType) },
    periodYear: { type: Number, required: true, min: 2000 },
    periodMonth: { type: Number, required: true, min: 1, max: 12 },
    lines: { type: [PayoutStatementLineSchema], default: [] },
    totalGrossAmount: { type: Number, required: true, default: 0, min: 0 },
    totalPayoutAmount: { type: Number, required: true, default: 0, min: 0 },
    status: { type: String, required: true, enum: Object.values(PayoutStatus), default: PayoutStatus.DRAFT },
    generatedAt: { type: Date, required: true, default: () => new Date() },
    generatedByUserId: { type: String, required: true },
    finalizedAt: { type: Date },
    finalizedByUserId: { type: String },
  },
  { timestamps: true, collection: "payout_statements" },
);

// One statement per doctor per period — regenerating an existing DRAFT
// replaces it rather than duplicating (enforced in payroll.service.ts);
// a FINALIZED/PAID statement is never regenerated over.
PayoutStatementSchema.index({ doctorId: 1, periodYear: 1, periodMonth: 1 }, { unique: true });

export const PayoutStatement: Model<PayoutStatementAttrs> = model<PayoutStatementAttrs>(
  "PayoutStatement",
  PayoutStatementSchema,
);

import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { StockTransactionType } from "../../types/common.types.js";

/**
 * Immutable ledger row appended by the Pharmacy Stock Dispensation Engine
 * (and every other stock-moving service) inside the same transaction that
 * mutates `DrugBatch.quantityOnHand`. Never updated after insert — a
 * correction is a new offsetting transaction, per standard inventory
 * ledger practice. This is what stock-on-hand reports and audits
 * reconcile against.
 */
export interface StockTransactionAttrs {
  drugId: Types.ObjectId;
  batchId: Types.ObjectId;
  type: StockTransactionType;
  quantityDelta: number; // positive for inbound (purchase/return-to-stock), negative for outbound
  quantityOnHandAfter: number;
  referenceType?: "PRESCRIPTION" | "PURCHASE_ORDER" | "MANUAL";
  referenceId?: Types.ObjectId;
  reason?: string;
  performedByUserId: string;
  performedAt: Date;
}

export type StockTransactionDocument = HydratedDocument<StockTransactionAttrs>;

const StockTransactionSchema = new Schema<StockTransactionAttrs>(
  {
    drugId: { type: Schema.Types.ObjectId, ref: "Drug", required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: "DrugBatch", required: true, index: true },
    type: { type: String, required: true, enum: Object.values(StockTransactionType) },
    quantityDelta: { type: Number, required: true },
    quantityOnHandAfter: { type: Number, required: true, min: 0 },
    referenceType: { type: String, enum: ["PRESCRIPTION", "PURCHASE_ORDER", "MANUAL"] },
    referenceId: { type: Schema.Types.ObjectId },
    reason: { type: String, trim: true, maxlength: 500 },
    performedByUserId: { type: String, required: true },
    performedAt: { type: Date, required: true, default: () => new Date() },
  },
  {
    timestamps: true,
    collection: "stock_transactions",
  },
);

StockTransactionSchema.index({ batchId: 1, performedAt: -1 });
StockTransactionSchema.index({ type: 1, performedAt: -1 });

export const StockTransaction: Model<StockTransactionAttrs> = model<StockTransactionAttrs>(
  "StockTransaction",
  StockTransactionSchema,
);

import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";

/**
 * A single received batch/lot of a Drug. `quantityOnHand` is the field
 * every stock-deduction transaction decrements — always via
 * `withTransaction`, always filtered on `quantityOnHand: { $gte: qty }`
 * to prevent overselling under concurrent dispensation.
 * `optimisticConcurrency` adds defense in depth.
 */
export interface DrugBatchAttrs {
  drugId: Types.ObjectId;
  batchNumber: string;
  barcodeValue?: string;
  supplierId: Types.ObjectId;
  purchaseOrderId?: Types.ObjectId;
  manufacturingDate?: Date;
  expiryDate: Date;
  quantityReceived: number;
  quantityOnHand: number;
  costPricePerUnit: number;
  mrpPerUnit: number;
  storageLocation?: string; // e.g. "Pharmacy-Rack-B4"
  isQuarantined: boolean; // set true on recall/damage pending disposition
  receivedAt: Date;
  receivedByUserId: string;
}

export type DrugBatchDocument = HydratedDocument<DrugBatchAttrs>;

const DrugBatchSchema = new Schema<DrugBatchAttrs>(
  {
    drugId: { type: Schema.Types.ObjectId, ref: "Drug", required: true, index: true },
    batchNumber: { type: String, required: true, trim: true },
    barcodeValue: { type: String, index: true, sparse: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder" },
    manufacturingDate: { type: Date },
    expiryDate: { type: Date, required: true },
    quantityReceived: { type: Number, required: true, min: 0 },
    quantityOnHand: { type: Number, required: true, min: 0 },
    costPricePerUnit: { type: Number, required: true, min: 0 },
    mrpPerUnit: { type: Number, required: true, min: 0 },
    storageLocation: { type: String, trim: true },
    isQuarantined: { type: Boolean, required: true, default: false },
    receivedAt: { type: Date, required: true, default: () => new Date() },
    receivedByUserId: { type: String, required: true },
  },
  { timestamps: true, collection: "drug_batches", optimisticConcurrency: true },
);

DrugBatchSchema.index({ drugId: 1, batchNumber: 1 }, { unique: true });
// FEFO (first-expiry-first-out) dispensation query: cheapest usable batch by expiry.
DrugBatchSchema.index({ drugId: 1, expiryDate: 1, quantityOnHand: 1 });
// Expiry-monitoring sweep job's primary query.
DrugBatchSchema.index({ expiryDate: 1, quantityOnHand: 1 });

export const DrugBatch: Model<DrugBatchAttrs> = model<DrugBatchAttrs>("DrugBatch", DrugBatchSchema);

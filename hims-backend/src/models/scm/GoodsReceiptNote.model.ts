import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { GrnStatus } from "../../types/common.types.js";

export interface GrnLineItem {
  purchaseOrderLineItemId: Types.ObjectId; // ref -> PurchaseOrder.lineItems[]._id
  drugId: Types.ObjectId;
  drugName: string;
  batchNumber: string;
  manufacturingDate?: Date;
  expiryDate: Date;
  receivedQuantity: number;
  costPricePerUnit: number;
  mrpPerUnit: number;
  storageLocation?: string;
  /** Set once `postGrnToStock` has created the DrugBatch/StockTransaction pair for this line — lets a partially-posted GRN (shouldn't normally happen, since posting is one transaction, but defensive) be inspected line by line. */
  drugBatchId?: Types.ObjectId;
}

/**
 * The Goods Receipt Note: what actually arrived against a `PurchaseOrder`,
 * logged by the receiving clerk, checked off by a supervisor
 * (`PENDING_VERIFICATION` -> `VERIFIED`), and only then posted into the
 * live stock ledger (`VERIFIED` -> `POSTED`, the one step that's a real
 * `withTransaction` — see `SCMService.postGrnToStock`). Splitting
 * "verified" from "posted" is deliberate: a supervisor confirming the
 * paperwork matches the delivery is a different moment from the stock
 * actually becoming dispensable, and the request specifically asked for a
 * transaction keyed off a *verified* GRN.
 */
export interface GoodsReceiptNoteAttrs {
  grnNumber: string; // e.g. "GRN-2026-000031"
  purchaseOrderId: Types.ObjectId;
  supplierId: Types.ObjectId;
  supplierInvoiceNumber?: string;
  supplierInvoiceDocumentKey?: string; // uploaded vendor invoice reference, same convention as DischargeSummary.pdfStorageKey
  receivedDate: Date;
  lines: GrnLineItem[];
  status: GrnStatus;
  receivedByUserId: string;
  verifiedByUserId?: string;
  verifiedAt?: Date;
  postedByUserId?: string;
  postedAt?: Date;
  createdBy: string;
}

export type GoodsReceiptNoteDocument = HydratedDocument<GoodsReceiptNoteAttrs>;

const GrnLineItemSchema = new Schema<GrnLineItem>(
  {
    purchaseOrderLineItemId: { type: Schema.Types.ObjectId, required: true },
    drugId: { type: Schema.Types.ObjectId, ref: "Drug", required: true },
    drugName: { type: String, required: true },
    batchNumber: { type: String, required: true, trim: true },
    manufacturingDate: { type: Date },
    expiryDate: { type: Date, required: true },
    receivedQuantity: { type: Number, required: true, min: 1 },
    costPricePerUnit: { type: Number, required: true, min: 0 },
    mrpPerUnit: { type: Number, required: true, min: 0 },
    storageLocation: { type: String, trim: true },
    drugBatchId: { type: Schema.Types.ObjectId, ref: "DrugBatch" },
  },
  { _id: false },
);

const GoodsReceiptNoteSchema = new Schema<GoodsReceiptNoteAttrs>(
  {
    grnNumber: { type: String, required: true, unique: true, immutable: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    supplierInvoiceNumber: { type: String, trim: true },
    supplierInvoiceDocumentKey: { type: String },
    receivedDate: { type: Date, required: true, default: () => new Date() },
    lines: {
      type: [GrnLineItemSchema],
      validate: { validator: (v: GrnLineItem[]) => v.length > 0, message: "At least one line is required" },
    },
    status: { type: String, required: true, enum: Object.values(GrnStatus), default: GrnStatus.PENDING_VERIFICATION },
    receivedByUserId: { type: String, required: true },
    verifiedByUserId: { type: String },
    verifiedAt: { type: Date },
    postedByUserId: { type: String },
    postedAt: { type: Date },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "goods_receipt_notes" },
);

GoodsReceiptNoteSchema.index({ purchaseOrderId: 1 });
GoodsReceiptNoteSchema.index({ status: 1, createdAt: -1 });

export const GoodsReceiptNote: Model<GoodsReceiptNoteAttrs> = model<GoodsReceiptNoteAttrs>(
  "GoodsReceiptNote",
  GoodsReceiptNoteSchema,
);

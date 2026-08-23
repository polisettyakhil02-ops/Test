import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { PurchaseOrderStatus } from "../../types/common.types.js";

export interface PurchaseOrderLineItem {
  drugId: Types.ObjectId;
  drugName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCostPrice: number;
}

export interface PurchaseOrderAttrs {
  poNumber: string;
  supplierId: Types.ObjectId;
  status: PurchaseOrderStatus;
  lineItems: PurchaseOrderLineItem[];
  totalAmount: number;
  expectedDeliveryDate?: Date;
  approvedByUserId?: string;
  approvedAt?: Date;
  createdBy: string;
}

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrderAttrs>;

const PurchaseOrderLineItemSchema = new Schema<PurchaseOrderLineItem>(
  {
    drugId: { type: Schema.Types.ObjectId, ref: "Drug", required: true },
    drugName: { type: String, required: true },
    orderedQuantity: { type: Number, required: true, min: 1 },
    receivedQuantity: { type: Number, required: true, default: 0, min: 0 },
    unitCostPrice: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const PurchaseOrderSchema = new Schema<PurchaseOrderAttrs>(
  {
    poNumber: { type: String, required: true, unique: true, immutable: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(PurchaseOrderStatus),
      default: PurchaseOrderStatus.DRAFT,
    },
    lineItems: {
      type: [PurchaseOrderLineItemSchema],
      validate: { validator: (v: PurchaseOrderLineItem[]) => v.length > 0, message: "At least one line item is required" },
    },
    totalAmount: { type: Number, required: true, min: 0 },
    expectedDeliveryDate: { type: Date },
    approvedByUserId: { type: String },
    approvedAt: { type: Date },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "purchase_orders" },
);

PurchaseOrderSchema.index({ status: 1, createdAt: -1 });

export const PurchaseOrder: Model<PurchaseOrderAttrs> = model<PurchaseOrderAttrs>(
  "PurchaseOrder",
  PurchaseOrderSchema,
);

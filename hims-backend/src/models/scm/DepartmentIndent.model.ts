import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { LabOrderPriority, DepartmentIndentStatus } from "../../types/common.types.js";

export interface IndentLineItem {
  drugId: Types.ObjectId;
  drugName: string; // denormalized snapshot at request time
  requestedQuantity: number;
  approvedQuantity?: number;
}

/**
 * A ward's request for supplies from the central pharmacy store — the
 * demand side of procurement, distinct from `PurchaseOrder` (the supply
 * side, sent to an external vendor). `priority` reuses `LabOrderPriority`
 * (STAT/URGENT/ROUTINE): a ward that's out of syringes right now has
 * exactly the same three-tier urgency a STAT lab order does, so a
 * dedicated "IndentPriority" enum would just be that vocabulary again.
 */
export interface DepartmentIndentAttrs {
  indentNumber: string; // e.g. "IND-2026-000045"
  wardId: Types.ObjectId;
  requestedByUserId: string;
  priority: LabOrderPriority;
  status: DepartmentIndentStatus;
  items: IndentLineItem[];
  notes?: string;
  reviewedByUserId?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  /** POs raised (fully or partly) to fulfill this indent — see `PurchaseOrder.sourceIndentIds` for the reverse link. */
  linkedPurchaseOrderIds: Types.ObjectId[];
  createdBy: string;
}

export type DepartmentIndentDocument = HydratedDocument<DepartmentIndentAttrs>;

const IndentLineItemSchema = new Schema<IndentLineItem>(
  {
    drugId: { type: Schema.Types.ObjectId, ref: "Drug", required: true },
    drugName: { type: String, required: true },
    requestedQuantity: { type: Number, required: true, min: 1 },
    approvedQuantity: { type: Number, min: 0 },
  },
  { _id: false },
);

const DepartmentIndentSchema = new Schema<DepartmentIndentAttrs>(
  {
    indentNumber: { type: String, required: true, unique: true, immutable: true },
    wardId: { type: Schema.Types.ObjectId, ref: "Ward", required: true, index: true },
    requestedByUserId: { type: String, required: true },
    priority: { type: String, required: true, enum: Object.values(LabOrderPriority), default: LabOrderPriority.ROUTINE },
    status: {
      type: String,
      required: true,
      enum: Object.values(DepartmentIndentStatus),
      default: DepartmentIndentStatus.PENDING,
    },
    items: {
      type: [IndentLineItemSchema],
      validate: { validator: (v: IndentLineItem[]) => v.length > 0, message: "At least one item is required" },
    },
    notes: { type: String, trim: true, maxlength: 1000 },
    reviewedByUserId: { type: String },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    linkedPurchaseOrderIds: { type: [Schema.Types.ObjectId], ref: "PurchaseOrder", default: [] },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "department_indents" },
);

// The procurement dashboard's "pending indents" query.
DepartmentIndentSchema.index({ status: 1, priority: 1, createdAt: 1 });
DepartmentIndentSchema.index({ wardId: 1, createdAt: -1 });

export const DepartmentIndent: Model<DepartmentIndentAttrs> = model<DepartmentIndentAttrs>(
  "DepartmentIndent",
  DepartmentIndentSchema,
);

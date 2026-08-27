import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { InvoiceStatus, PayerType } from "../../types/common.types.js";

export interface InvoiceLineItem {
  _id?: Types.ObjectId;
  tariffServiceId: Types.ObjectId;
  serviceCode: string;
  description: string;
  serviceCategory: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  lineTotal: number; // (quantity * unitPrice) - discountAmount + taxAmount
  sourceType: "OPD_VISIT" | "ADMISSION" | "PHARMACY" | "LAB_ORDER" | "OT_SCHEDULE" | "MANUAL";
  sourceId?: Types.ObjectId;
  postedAt: Date;
  postedByUserId: string;
}

/**
 * The financial ledger row for one patient encounter. All mutations that
 * add line items, apply payments, or change status MUST run inside
 * `withTransaction` alongside whatever inventory/bed/order state they
 * originate from (e.g. Dispensation + Invoice line item together) — this
 * schema intentionally stores computed totals rather than relying on
 * application-side aggregation at read time, so the invoice is
 * self-consistent even mid-stay before it is finalized.
 */
export interface InvoiceAttrs {
  invoiceNumber: string;
  patientId: Types.ObjectId;
  opdVisitId?: Types.ObjectId;
  admissionId?: Types.ObjectId;
  payerType: PayerType;
  insurancePolicyId?: Types.ObjectId;
  lineItems: InvoiceLineItem[];
  subTotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
  dueDate?: Date;
  finalizedAt?: Date;
  finalizedByUserId?: string;
  cancellationReason?: string;
  createdBy: string;
}

export type InvoiceDocument = HydratedDocument<InvoiceAttrs>;

const InvoiceLineItemSchema = new Schema<InvoiceLineItem>(
  {
    tariffServiceId: { type: Schema.Types.ObjectId, ref: "TariffMaster", required: true },
    serviceCode: { type: String, required: true },
    description: { type: String, required: true },
    serviceCategory: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.01 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, required: true, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, required: true, default: 0, min: 0 },
    taxRatePercent: { type: Number, required: true, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, required: true, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    sourceType: {
      type: String,
      required: true,
      enum: ["OPD_VISIT", "ADMISSION", "PHARMACY", "LAB_ORDER", "OT_SCHEDULE", "MANUAL"],
    },
    sourceId: { type: Schema.Types.ObjectId },
    postedAt: { type: Date, required: true, default: () => new Date() },
    postedByUserId: { type: String, required: true },
  },
  { _id: true },
);

const InvoiceSchema = new Schema<InvoiceAttrs>(
  {
    invoiceNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    opdVisitId: { type: Schema.Types.ObjectId, ref: "OPDVisit" },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    payerType: { type: String, required: true, enum: Object.values(PayerType), default: PayerType.SELF_PAY },
    insurancePolicyId: { type: Schema.Types.ObjectId, ref: "InsurancePolicy" },
    lineItems: { type: [InvoiceLineItemSchema], default: [] },
    subTotal: { type: Number, required: true, default: 0, min: 0 },
    totalDiscount: { type: Number, required: true, default: 0, min: 0 },
    totalTax: { type: Number, required: true, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, default: 0, min: 0 },
    amountPaid: { type: Number, required: true, default: 0, min: 0 },
    amountDue: { type: Number, required: true, default: 0, min: 0 },
    status: { type: String, required: true, enum: Object.values(InvoiceStatus), default: InvoiceStatus.DRAFT },
    dueDate: { type: Date },
    finalizedAt: { type: Date },
    finalizedByUserId: { type: String },
    cancellationReason: { type: String, trim: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "invoices", optimisticConcurrency: true },
);

InvoiceSchema.index({ patientId: 1, createdAt: -1 });
InvoiceSchema.index({ status: 1, dueDate: 1 });
InvoiceSchema.index({ admissionId: 1 }, { sparse: true });

export const Invoice: Model<InvoiceAttrs> = model<InvoiceAttrs>("Invoice", InvoiceSchema);

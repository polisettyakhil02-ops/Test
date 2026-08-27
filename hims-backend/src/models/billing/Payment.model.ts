import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { PaymentMode } from "../../types/common.types.js";

/**
 * One payment or refund event against an Invoice. Kept as its own
 * append-only collection (rather than embedded on Invoice) so partial
 * payments, multiple payment modes on one invoice, and refunds each get
 * an independently auditable, immutable record with their own receipt
 * number. `Invoice.amountPaid`/`amountDue` are updated in the same
 * transaction as the Payment insert.
 */
export interface PaymentAttrs {
  receiptNumber: string;
  invoiceId: Types.ObjectId;
  patientId: Types.ObjectId;
  amount: number; // positive for a payment, negative for a refund
  mode: PaymentMode;
  transactionType: "PAYMENT" | "REFUND";
  referenceNumber?: string; // gateway/cheque/UTR reference
  gatewayResponseCode?: string;
  collectedByUserId: string;
  collectedAt: Date;
  notes?: string;
}

export type PaymentDocument = HydratedDocument<PaymentAttrs>;

const PaymentSchema = new Schema<PaymentAttrs>(
  {
    receiptNumber: { type: String, required: true, unique: true, immutable: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    amount: { type: Number, required: true },
    mode: { type: String, required: true, enum: Object.values(PaymentMode) },
    transactionType: { type: String, required: true, enum: ["PAYMENT", "REFUND"] },
    referenceNumber: { type: String, trim: true },
    gatewayResponseCode: { type: String, trim: true },
    collectedByUserId: { type: String, required: true },
    collectedAt: { type: Date, required: true, default: () => new Date() },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: "payments" },
);

PaymentSchema.index({ invoiceId: 1, collectedAt: -1 });
PaymentSchema.index({ patientId: 1, collectedAt: -1 });

export const Payment: Model<PaymentAttrs> = model<PaymentAttrs>("Payment", PaymentSchema);

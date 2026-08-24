import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { ExpenseCategory, ExpensePaymentStatus, PaymentMode } from "../../types/common.types.js";

/**
 * Non-patient hospital OPEX — electricity, cleaning supplies, AMC/vendor
 * payments, and the like. Deliberately separate from `Invoice`/`Payment`
 * (Step 1's billing domain), which are entirely patient-revenue-facing;
 * this is the mirror-image expense side Accounts Payable actually works
 * from. `paymentMode` reuses the existing `PaymentMode` enum (a payment is
 * a payment, whichever direction the money moves) even though a couple of
 * its patient-billing-specific values (INSURANCE, CORPORATE) will simply
 * never be picked here.
 */
export interface ExpenseAttrs {
  expenseNumber: string; // e.g. "EXP-2026-000512"
  category: ExpenseCategory;
  description: string;
  amount: number;
  expenseDate: Date;
  vendorName?: string;
  invoiceDocumentKey?: string; // uploaded vendor invoice reference, same convention as DischargeSummary.pdfStorageKey
  departmentId?: Types.ObjectId;
  paymentStatus: ExpensePaymentStatus;
  paymentMode?: PaymentMode;
  paymentReferenceNumber?: string; // cheque number / UTR / transaction id
  paidAt?: Date;
  paidByUserId?: string;
  createdBy: string;
}

export type ExpenseDocument = HydratedDocument<ExpenseAttrs>;

const ExpenseSchema = new Schema<ExpenseAttrs>(
  {
    expenseNumber: { type: String, required: true, unique: true, immutable: true },
    category: { type: String, required: true, enum: Object.values(ExpenseCategory) },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    amount: { type: Number, required: true, min: 0 },
    expenseDate: { type: Date, required: true, default: () => new Date() },
    vendorName: { type: String, trim: true },
    invoiceDocumentKey: { type: String },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    paymentStatus: {
      type: String,
      required: true,
      enum: Object.values(ExpensePaymentStatus),
      default: ExpensePaymentStatus.PENDING,
    },
    paymentMode: { type: String, enum: Object.values(PaymentMode) },
    paymentReferenceNumber: { type: String, trim: true },
    paidAt: { type: Date },
    paidByUserId: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "expenses" },
);

// Accounts Payable's dominant queries: the pending-payment worklist, and category/date reporting.
ExpenseSchema.index({ paymentStatus: 1, expenseDate: -1 });
ExpenseSchema.index({ category: 1, expenseDate: -1 });

export const Expense: Model<ExpenseAttrs> = model<ExpenseAttrs>("Expense", ExpenseSchema);

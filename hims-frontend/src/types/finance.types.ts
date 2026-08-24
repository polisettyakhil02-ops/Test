import type { ExpenseCategory, ExpensePaymentStatus, PaymentMode } from "./common.types";

/** Mirrors Expense.model.ts. */
export interface Expense {
  _id: string;
  expenseNumber: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expenseDate: string;
  vendorName?: string;
  invoiceDocumentKey?: string;
  departmentId?: string;
  paymentStatus: ExpensePaymentStatus;
  paymentMode?: PaymentMode;
  paymentReferenceNumber?: string;
  paidAt?: string;
  paidByUserId?: string;
  createdAt: string;
}

export interface LogExpensePayload {
  category: ExpenseCategory;
  description: string;
  amount: number;
  expenseDate?: string;
  vendorName?: string;
  invoiceDocumentKey?: string;
  departmentId?: string;
}

export interface MarkExpensePaidPayload {
  paymentMode: PaymentMode;
  paymentReferenceNumber?: string;
}

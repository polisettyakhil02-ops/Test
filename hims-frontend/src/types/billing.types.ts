import type { InvoiceStatus, PaymentMode } from "./common.types";

export interface InvoiceLineItem {
  _id?: string;
  serviceCode: string;
  description: string;
  serviceCategory: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  sourceType: "OPD_VISIT" | "ADMISSION" | "PHARMACY" | "LAB_ORDER" | "OT_SCHEDULE" | "MANUAL";
  postedAt: string;
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  patientId: string;
  lineItems: InvoiceLineItem[];
  subTotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
  createdAt: string;
}

/** GET /api/billing/:patientId/active-invoice response body. */
export interface ActiveInvoiceResponse {
  invoice: Invoice;
  summaryByCategory: Record<string, number>;
}

export interface PayInvoicePayload {
  invoiceId: string;
  amount?: number;
  mode: PaymentMode;
  referenceNumber?: string;
  notes?: string;
}

export interface Payment {
  _id: string;
  receiptNumber: string;
  invoiceId: string;
  amount: number;
  mode: PaymentMode;
  collectedAt: string;
}

export interface PayInvoiceResult {
  invoice: Invoice;
  payment: Payment;
}

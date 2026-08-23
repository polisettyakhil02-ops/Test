import { withTransaction } from "../config/database.js";
import { Invoice, type InvoiceDocument } from "../models/billing/Invoice.model.js";
import { Payment, type PaymentDocument } from "../models/billing/Payment.model.js";
import { InvoiceStatus, PaymentMode } from "../types/common.types.js";
import { generateReceiptNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { round2 } from "../utils/money.js";
import { firstOrThrow } from "../utils/assert.js";
import { NotFoundError, ConflictError, ValidationError } from "../utils/errors.js";

/** Statuses that may still receive a payment. PAID/CANCELLED/REFUNDED are terminal for this operation. */
const PAYABLE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.FINALIZED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

export interface PayInvoiceInput {
  invoiceId: string;
  /** Defaults to the invoice's full `amountDue` — i.e. pay it off in one shot. */
  amount?: number;
  mode: PaymentMode;
  referenceNumber?: string;
  notes?: string;
  collectedByUserId: string;
}

export interface PayInvoiceResult {
  invoice: InvoiceDocument;
  payment: PaymentDocument;
}

/**
 * Billing Service. `payInvoice` posts a `Payment` and updates the
 * `Invoice`'s running totals/status atomically — a payment can never be
 * recorded without the invoice reflecting it, or vice versa. Once the
 * first payment lands, a still-DRAFT invoice is implicitly finalized:
 * every other service that posts charges (`PharmacyService`, etc.) only
 * ever appends to a DRAFT invoice, so this is what "locks" it from
 * further line-item edits — a paid-against invoice is no longer DRAFT
 * and those services will reject new charges against it.
 */
export class BillingService {
  async payInvoice(input: PayInvoiceInput): Promise<PayInvoiceResult> {
    const invoiceId = toObjectId(input.invoiceId, "invoiceId");

    return withTransaction(async (session) => {
      const invoice = await Invoice.findById(invoiceId).session(session);
      if (!invoice) {
        throw new NotFoundError(`Invoice ${input.invoiceId} not found`);
      }
      if (!PAYABLE_STATUSES.includes(invoice.status)) {
        throw new ConflictError(`Invoice ${invoice.invoiceNumber} is ${invoice.status} and cannot accept payment`);
      }

      const amountToPay = round2(input.amount ?? invoice.amountDue);
      if (amountToPay <= 0) {
        throw new ValidationError("Payment amount must be positive");
      }
      if (amountToPay > invoice.amountDue) {
        throw new ValidationError(
          `Payment amount (${amountToPay}) exceeds amount due (${invoice.amountDue}) on invoice ${invoice.invoiceNumber}`,
        );
      }

      const receiptNumber = await generateReceiptNumber();
      const payment = firstOrThrow(
        await Payment.create(
          [
            {
              receiptNumber,
              invoiceId: invoice._id,
              patientId: invoice.patientId,
              amount: amountToPay,
              mode: input.mode,
              transactionType: "PAYMENT",
              referenceNumber: input.referenceNumber,
              collectedByUserId: input.collectedByUserId,
              collectedAt: new Date(),
              notes: input.notes,
            },
          ],
          { session },
        ),
        "Payment.create returned no document",
      );

      if (invoice.status === InvoiceStatus.DRAFT) {
        invoice.finalizedAt = new Date();
        invoice.finalizedByUserId = input.collectedByUserId;
      }
      invoice.amountPaid = round2(invoice.amountPaid + amountToPay);
      invoice.amountDue = round2(invoice.amountDue - amountToPay);
      invoice.status = invoice.amountDue <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
      await invoice.save({ session });

      return { invoice, payment };
    });
  }
}

export const billingService = new BillingService();

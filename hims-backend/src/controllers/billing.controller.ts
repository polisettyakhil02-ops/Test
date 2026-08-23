import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Invoice } from "../models/billing/Invoice.model.js";
import { billingService } from "../services/billing.service.js";
import { InvoiceStatus, PaymentMode } from "../types/common.types.js";
import { toObjectId } from "../utils/objectId.js";
import { round2 } from "../utils/money.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

/**
 * GET /api/billing/:patientId/active-invoice — the patient's current
 * unbilled (DRAFT) invoice, with a per-service-category subtotal
 * (bed rent, pharmacy, doctor visits, ...) for the consolidated
 * invoicing UI. Billing Executive/Admin only.
 */
export async function getActiveInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { patientId } = req.params;
    if (!patientId) {
      throw new ValidationError("patientId route parameter is required");
    }

    const invoice = await Invoice.findOne({
      patientId: toObjectId(patientId, "patientId"),
      status: InvoiceStatus.DRAFT,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!invoice) {
      res.status(200).json({ data: null, message: "No active (DRAFT) invoice for this patient" });
      return;
    }

    const summaryByCategory = invoice.lineItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.serviceCategory] = round2((acc[item.serviceCategory] ?? 0) + item.lineTotal);
      return acc;
    }, {});

    res.status(200).json({ data: { invoice, summaryByCategory } });
  } catch (err) {
    next(err);
  }
}

const PayInvoiceSchema = z.object({
  amount: z.number().positive().optional(),
  mode: z.nativeEnum(PaymentMode),
  referenceNumber: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/billing/:invoiceId/pay — records a payment via
 * `BillingService.payInvoice` (atomic Payment + Invoice update). Paying
 * off the full `amountDue` (the default when `amount` is omitted) marks
 * the invoice PAID; anything less leaves it PARTIALLY_PAID. Either way,
 * once paid against, a DRAFT invoice is finalized and locked from
 * further line-item edits by the services that post charges to it.
 * Billing Executive/Admin only.
 */
export async function payInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }
    const { invoiceId } = req.params;
    if (!invoiceId) {
      throw new ValidationError("invoiceId route parameter is required");
    }

    const parsed = PayInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    const result = await billingService.payInvoice({
      invoiceId,
      amount: input.amount,
      mode: input.mode,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      collectedByUserId: req.user.id,
    });

    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

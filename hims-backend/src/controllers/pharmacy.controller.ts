import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Prescription } from "../models/emr/Prescription.model.js";
import { pharmacyService } from "../services/pharmacy.service.js";
import { PrescriptionStatus } from "../types/common.types.js";
import { AuthenticationError, ValidationError, NotFoundError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

/**
 * GET /api/pharmacy/prescriptions/pending — the pharmacy counter's
 * worklist: every prescription with at least one item still owed
 * (ORDERED or PARTIALLY_DISPENSED), oldest first.
 */
export async function getPendingPrescriptions(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prescriptions = await Prescription.find({
      status: { $in: [PrescriptionStatus.ORDERED, PrescriptionStatus.PARTIALLY_DISPENSED] },
    })
      .sort({ prescribedAt: 1 })
      .populate("patientId", "uhid firstName lastName phone")
      .populate("doctorId", "fullName specializations")
      .lean();

    res.status(200).json({ data: prescriptions });
  } catch (err) {
    next(err);
  }
}

const DispenseMedicationSchema = z.object({
  prescriptionId: z.string().min(1),
  patientId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().positive(),
  invoiceId: z.string().optional(),
});

/**
 * POST /api/pharmacy/dispense — executes the ACID
 * `PharmacyService.dispenseMedication` transaction: FEFO batch decrement,
 * stock ledger, invoice line item, prescription status update, and a
 * dispensation receipt. Pharmacist only.
 */
export async function dispenseMedication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }

    const parsed = DispenseMedicationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    // Cross-check patientId against the prescription up front, before
    // opening the dispensation transaction, so a mismatched request fails
    // fast with a clear error rather than mid-transaction.
    const prescription = await Prescription.findById(input.prescriptionId).select("patientId").lean();
    if (!prescription) {
      throw new NotFoundError(`Prescription ${input.prescriptionId} not found`);
    }
    if (prescription.patientId.toString() !== input.patientId) {
      throw new ValidationError("patientId does not match the prescription's patient");
    }

    const result = await pharmacyService.dispenseMedication({
      prescriptionId: input.prescriptionId,
      prescriptionItemId: input.itemId,
      quantityToDispense: input.quantity,
      dispensedByUserId: req.user.id,
      invoiceId: input.invoiceId,
    });

    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

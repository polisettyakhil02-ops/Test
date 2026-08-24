import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Specimen } from "../models/lims/Specimen.model.js";
import { phlebotomyService } from "../services/phlebotomy.service.js";
import { SpecimenStatus, LabOrderPriority } from "../types/common.types.js";
import { AuthenticationError, NotFoundError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

/** STAT first, then URGENT, then ROUTINE — same in-app ranking `lims.controller.ts` uses, since MongoDB can't sort an enum by clinical severity natively. */
const PRIORITY_RANK: Record<LabOrderPriority, number> = {
  [LabOrderPriority.STAT]: 0,
  [LabOrderPriority.URGENT]: 1,
  [LabOrderPriority.ROUTINE]: 2,
};

interface QueueLabOrderRef {
  _id: unknown;
  orderNumber: string;
  priority: LabOrderPriority;
  orderingDoctorId?: { fullName?: string } | null;
}

/**
 * GET /api/phlebotomy/queue — the TV-style waiting-room board and the
 * technician's worklist: every specimen still `PENDING_COLLECTION`,
 * ranked STAT-first then oldest-first. Queries `Specimen` directly (no
 * service passthrough for a plain read), same pattern as
 * `lims.controller.ts#listLabOrders`.
 */
export async function listQueue(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const specimens = await Specimen.find({ status: SpecimenStatus.PENDING_COLLECTION })
      .populate("patientId", "uhid firstName lastName dateOfBirth gender")
      .populate({ path: "labOrderId", select: "orderNumber priority orderingDoctorId", populate: { path: "orderingDoctorId", select: "fullName" } })
      .lean();

    specimens.sort((a, b) => {
      const orderA = a.labOrderId as unknown as QueueLabOrderRef;
      const orderB = b.labOrderId as unknown as QueueLabOrderRef;
      const rankDiff = PRIORITY_RANK[orderA.priority] - PRIORITY_RANK[orderB.priority];
      if (rankDiff !== 0) return rankDiff;
      // ObjectId's leading 4 bytes are a creation timestamp, so a plain
      // string compare gives the same oldest-first ordering `createdAt`
      // would — without needing timestamps added to `SpecimenAttrs`.
      return String(a._id).localeCompare(String(b._id));
    });

    res.status(200).json({ data: specimens });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/phlebotomy/specimens/:barcodeValue — the technician's
 * print-a-label / verify-before-draw lookup.
 */
export async function getSpecimenLabel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { barcodeValue } = req.params;
    if (!barcodeValue) {
      throw new ValidationError("barcodeValue route parameter is required");
    }

    const specimen = await Specimen.findOne({ barcodeValue })
      .populate("patientId", "uhid firstName lastName dateOfBirth gender")
      .populate({ path: "labOrderId", select: "orderNumber priority orderingDoctorId", populate: { path: "orderingDoctorId", select: "fullName" } })
      .lean();
    if (!specimen) {
      throw new NotFoundError(`No specimen found for barcode "${barcodeValue}"`);
    }

    res.status(200).json({ data: specimen });
  } catch (err) {
    next(err);
  }
}

const CollectSpecimenSchema = z.object({ barcodeValue: z.string().min(1) }).strict();

/** POST /api/phlebotomy/specimens/collect — the barcode scan/entry that marks a sample Collected. */
export async function collectSpecimen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }
    const parsed = CollectSpecimenSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }

    const result = await phlebotomyService.collectSpecimen({
      barcodeValue: parsed.data.barcodeValue,
      performedByUserId: req.user.id,
    });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

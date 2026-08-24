import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { LabOrder } from "../models/lims/LabOrder.model.js";
import { limsService } from "../services/lims.service.js";
import { EncounterType, LabOrderPriority, LabOrderStatus } from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

const CreateLabOrderSchema = z.object({
  patientId: z.string().min(1),
  orderingDoctorId: z.string().min(1),
  encounterType: z.nativeEnum(EncounterType),
  opdVisitId: z.string().optional(),
  admissionId: z.string().optional(),
  clinicalNoteId: z.string().optional(),
  labTestIds: z.array(z.string().min(1)).min(1, "At least one labTestId is required"),
  priority: z.nativeEnum(LabOrderPriority).optional(),
  clinicalNotes: z.string().max(1000).optional(),
});

/**
 * POST /api/lims/orders — places a lab order via `LIMSService.createLabOrder`
 * (order + accessioned specimens, one transaction). Doctor only: ordering
 * a test is a clinical decision, same gating as `POST /api/emr/:patientId/prescriptions`.
 */
export async function createLabOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }

    const parsed = CreateLabOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    const result = await limsService.createLabOrder({
      patientId: input.patientId,
      orderingDoctorId: input.orderingDoctorId,
      encounterType: input.encounterType,
      opdVisitId: input.opdVisitId,
      admissionId: input.admissionId,
      clinicalNoteId: input.clinicalNoteId,
      labTestIds: input.labTestIds,
      priority: input.priority,
      clinicalNotes: input.clinicalNotes,
      performedByUserId: req.user.id,
    });

    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** Orders still awaiting a final report — the lab technician's worklist default. */
const LAB_WORKLIST_STATUSES: LabOrderStatus[] = [
  LabOrderStatus.ORDERED,
  LabOrderStatus.SAMPLE_COLLECTED,
  LabOrderStatus.IN_LAB,
];

/** STAT first, then URGENT, then ROUTINE — MongoDB can't sort an enum by severity natively, so this is applied in-app after the (bounded-size) worklist query. */
const PRIORITY_RANK: Record<LabOrderPriority, number> = {
  [LabOrderPriority.STAT]: 0,
  [LabOrderPriority.URGENT]: 1,
  [LabOrderPriority.ROUTINE]: 2,
};

/**
 * GET /api/lims/orders — the lab technician's worklist: every order not
 * yet fully reported (or whichever statuses `?status=` names), sorted by
 * priority then age. Lab Technician only.
 */
export async function listLabOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const statusParam = req.query.status;
    const requestedStatuses =
      typeof statusParam === "string"
        ? (statusParam.split(",").filter(Boolean) as LabOrderStatus[])
        : undefined;
    const statuses = requestedStatuses && requestedStatuses.length > 0 ? requestedStatuses : LAB_WORKLIST_STATUSES;

    const orders = await LabOrder.find({ status: { $in: statuses } })
      .populate("patientId", "uhid firstName lastName phone")
      .populate("orderingDoctorId", "fullName specializations")
      .lean();

    orders.sort(
      (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.orderedAt.getTime() - b.orderedAt.getTime(),
    );

    res.status(200).json({ data: orders });
  } catch (err) {
    next(err);
  }
}

const ReceiveSpecimenSchema = z.object({ barcodeValue: z.string().min(1) }).strict();

/**
 * POST /api/lims/specimens/receive — the lab bench's intake scan, via
 * `LIMSService.receiveSpecimen`. Lab Technician only; this is what
 * unblocks `submitLabResult` for every test line sharing the barcode.
 */
export async function receiveSpecimen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }
    const parsed = ReceiveSpecimenSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }

    const result = await limsService.receiveSpecimen({
      barcodeValue: parsed.data.barcodeValue,
      performedByUserId: req.user.id,
    });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

const SubmitLabResultParameterSchema = z.object({
  parameterName: z.string().min(1).max(200),
  value: z.string().min(1).max(500),
  numericValue: z.number().optional(),
  unit: z.string().max(50).optional(),
});

const SubmitLabResultSchema = z.object({
  parameters: z.array(SubmitLabResultParameterSchema).min(1, "At least one parameter is required"),
  interpretiveComment: z.string().max(2000).optional(),
});

/**
 * POST /api/lims/orders/:orderId/tests/:lineId/result — enters a result
 * via `LIMSService.submitLabResult`, which does the reference-range
 * comparison and flag derivation. Lab Technician only.
 */
export async function submitLabResult(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }

    const { orderId, lineId } = req.params;
    if (!orderId || !lineId) {
      throw new ValidationError("orderId and lineId route parameters are required");
    }

    const parsed = SubmitLabResultSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    const result = await limsService.submitLabResult({
      labOrderId: orderId,
      labOrderTestLineId: lineId,
      parameters: input.parameters,
      interpretiveComment: input.interpretiveComment,
      performedByUserId: req.user.id,
    });

    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

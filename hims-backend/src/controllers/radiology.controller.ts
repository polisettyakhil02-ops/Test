import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { radiologyService } from "../services/radiology.service.js";
import { AssetCategory, EncounterType, LabOrderPriority, RadiologyOrderStatus } from "../types/common.types.js";
import { AuthenticationError, NotFoundError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

/** GET /api/radiology/machines — every active imaging device from the biomedical asset registry. */
export async function listMachines(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const machines = await radiologyService.listMachines();
    res.status(200).json({ data: machines });
  } catch (err) {
    next(err);
  }
}

const CreateOrderSchema = z
  .object({
    patientId: z.string().min(1),
    orderingDoctorId: z.string().min(1),
    encounterType: z.nativeEnum(EncounterType),
    opdVisitId: z.string().optional(),
    admissionId: z.string().optional(),
    modality: z.nativeEnum(AssetCategory),
    bodyPart: z.string().min(1).max(150),
    clinicalIndication: z.string().min(1).max(1000),
    contrastRequired: z.boolean().optional(),
    priority: z.nativeEnum(LabOrderPriority).optional(),
  })
  .strict();

/** POST /api/radiology/orders — places an imaging order. Doctor only, same gating as `POST /api/lims/orders`. */
export async function createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const order = await radiologyService.createOrder({ ...parsed.data, performedByUserId: req.user.id });
    res.status(201).json({ data: order });
  } catch (err) {
    next(err);
  }
}

/** GET /api/radiology/orders?status=&modality= — the technician's worklist. */
export async function listWorklist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const statusParam = req.query.status;
    const status =
      typeof statusParam === "string" ? (statusParam.split(",").filter(Boolean) as RadiologyOrderStatus[]) : undefined;
    const modality = typeof req.query.modality === "string" ? (req.query.modality as AssetCategory) : undefined;

    const orders = await radiologyService.listWorklist({ status, modality });
    res.status(200).json({ data: orders });
  } catch (err) {
    next(err);
  }
}

/** GET /api/radiology/modality-worklist?machineAssetId=&date= — mimics a DICOM Modality Worklist for one scanner. */
export async function getModalityWorklist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const machineAssetId = typeof req.query.machineAssetId === "string" ? req.query.machineAssetId : undefined;
    if (!machineAssetId) throw new ValidationError("machineAssetId query parameter is required");
    const date = typeof req.query.date === "string" ? req.query.date : undefined;

    const worklist = await radiologyService.getModalityWorklist(machineAssetId, date);
    res.status(200).json({ data: worklist });
  } catch (err) {
    next(err);
  }
}

const ScheduleOrderSchema = z.object({ machineAssetId: z.string().min(1), scheduledAt: z.string().min(1) }).strict();

/** POST /api/radiology/orders/:orderId/schedule — assigns a machine + time. */
export async function scheduleOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { orderId } = req.params;
    if (!orderId) throw new ValidationError("orderId route parameter is required");
    const parsed = ScheduleOrderSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const order = await radiologyService.scheduleOrder({ orderId, ...parsed.data });
    res.status(200).json({ data: order });
  } catch (err) {
    next(err);
  }
}

/** POST /api/radiology/orders/:orderId/start — SCHEDULED -> IN_PROGRESS. */
export async function startExam(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { orderId } = req.params;
    if (!orderId) throw new ValidationError("orderId route parameter is required");
    const order = await radiologyService.startExam(orderId);
    res.status(200).json({ data: order });
  } catch (err) {
    next(err);
  }
}

/** POST /api/radiology/orders/:orderId/complete — the technician's "mark scan Completed" action. */
export async function markCompleted(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { orderId } = req.params;
    if (!orderId) throw new ValidationError("orderId route parameter is required");
    const order = await radiologyService.markCompleted(orderId);
    res.status(200).json({ data: order });
  } catch (err) {
    next(err);
  }
}

/** GET /api/radiology/orders/:orderId — single-order lookup, e.g. a deep-linked/refreshed report editor. */
export async function getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { orderId } = req.params;
    if (!orderId) throw new ValidationError("orderId route parameter is required");
    const order = await radiologyService.getOrderById(orderId);
    if (!order) throw new NotFoundError(`Radiology order ${orderId} not found`);
    res.status(200).json({ data: order });
  } catch (err) {
    next(err);
  }
}

/** GET /api/radiology/orders/:orderId/report — the split-screen editor's initial load. */
export async function getReportForOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { orderId } = req.params;
    if (!orderId) throw new ValidationError("orderId route parameter is required");
    const report = await radiologyService.getReportForOrder(orderId);
    res.status(200).json({ data: report });
  } catch (err) {
    next(err);
  }
}

const SaveReportDraftSchema = z
  .object({
    radiologistId: z.string().min(1),
    findings: z.string().max(5000),
    impression: z.string().max(2000),
    isCriticalFinding: z.boolean().optional(),
    criticalFindingNotifiedTo: z.string().max(200).optional(),
  })
  .strict();

/** PUT /api/radiology/orders/:orderId/report — the split-screen editor's autosave. */
export async function saveReportDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { orderId } = req.params;
    if (!orderId) throw new ValidationError("orderId route parameter is required");
    const parsed = SaveReportDraftSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const report = await radiologyService.saveReportDraft({ radiologyOrderId: orderId, ...parsed.data });
    res.status(200).json({ data: report });
  } catch (err) {
    next(err);
  }
}

/** POST /api/radiology/reports/:reportId/finalize — locks the report and advances the order to REPORTED. */
export async function finalizeReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { reportId } = req.params;
    if (!reportId) throw new ValidationError("reportId route parameter is required");

    const result = await radiologyService.finalizeReport({ reportId, performedByUserId: req.user.id });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

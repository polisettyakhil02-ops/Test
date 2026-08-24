import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { dialysisService } from "../services/dialysis.service.js";
import { DialysisShift, DialysisSessionStatus, VascularAccessType } from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

/** GET /api/dialysis/machines — every active dialysis machine from the biomedical asset registry. */
export async function listMachines(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const machines = await dialysisService.listMachines();
    res.status(200).json({ data: machines });
  } catch (err) {
    next(err);
  }
}

const ScheduleSessionSchema = z
  .object({
    patientId: z.string().min(1),
    admissionId: z.string().optional(),
    machineAssetId: z.string().min(1),
    nephrologistId: z.string().min(1),
    technicianUserId: z.string().min(1),
    shift: z.nativeEnum(DialysisShift),
    scheduledStart: z.string().min(1),
    scheduledEnd: z.string().min(1),
    vascularAccessType: z.nativeEnum(VascularAccessType),
    preDialysisWeightKg: z.number().positive(),
    heparinDoseUnits: z.number().min(0),
    targetUltrafiltrationVolumeMl: z.number().min(0),
    bloodFlowRateMlPerMin: z.number().min(0).optional(),
    dialysateFlowRateMlPerMin: z.number().min(0).optional(),
    preDialysisSystolicBP: z.number().min(0).max(300).optional(),
    preDialysisDiastolicBP: z.number().min(0).max(200).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

/** POST /api/dialysis/sessions — books a machine slot, rejecting an overlap with any other booking on the same machine. */
export async function scheduleDialysisSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const parsed = ScheduleSessionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const dialysisSession = await dialysisService.scheduleDialysisSession({ ...parsed.data, performedByUserId: req.user.id });
    res.status(201).json({ data: dialysisSession });
  } catch (err) {
    next(err);
  }
}

/** GET /api/dialysis/sessions?machineAssetId=&patientId=&status= — the scheduler grid's data source. */
export async function listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const machineAssetId = typeof req.query.machineAssetId === "string" ? req.query.machineAssetId : undefined;
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as DialysisSessionStatus) : undefined;
    const sessions = await dialysisService.listSessions({ machineAssetId, patientId, status });
    res.status(200).json({ data: sessions });
  } catch (err) {
    next(err);
  }
}

/** POST /api/dialysis/sessions/:sessionId/start — puts the patient on the machine. */
export async function startSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { sessionId } = req.params;
    if (!sessionId) throw new ValidationError("sessionId route parameter is required");
    const dialysisSession = await dialysisService.startSession(sessionId, req.user.id);
    res.status(200).json({ data: dialysisSession });
  } catch (err) {
    next(err);
  }
}

const CompleteSessionSchema = z
  .object({
    postDialysisWeightKg: z.number().positive(),
    actualUltrafiltrationVolumeMl: z.number().min(0),
    postDialysisSystolicBP: z.number().min(0).max(300).optional(),
    postDialysisDiastolicBP: z.number().min(0).max(200).optional(),
    complications: z.string().max(1000).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

/** POST /api/dialysis/sessions/:sessionId/complete — the Nephrology EMR's chart-completion form. */
export async function completeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { sessionId } = req.params;
    if (!sessionId) throw new ValidationError("sessionId route parameter is required");
    const parsed = CompleteSessionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const dialysisSession = await dialysisService.completeSession({ sessionId, ...parsed.data, performedByUserId: req.user.id });
    res.status(200).json({ data: dialysisSession });
  } catch (err) {
    next(err);
  }
}

const CancelSessionSchema = z.object({ reason: z.string().min(1).max(500) }).strict();

/** POST /api/dialysis/sessions/:sessionId/cancel — SCHEDULED -> CANCELLED, or IN_PROGRESS -> ABORTED, depending on the session's current state. */
export async function cancelSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { sessionId } = req.params;
    if (!sessionId) throw new ValidationError("sessionId route parameter is required");
    const parsed = CancelSessionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const dialysisSession = await dialysisService.cancelOrAbortSession(sessionId, parsed.data.reason, req.user.id);
    res.status(200).json({ data: dialysisSession });
  } catch (err) {
    next(err);
  }
}

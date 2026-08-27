import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { emergencyService } from "../services/emergency.service.js";
import { TriagePriority, ERArrivalMode, AirwayStatus, ERVisitStatus } from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

/** GET /api/emergency/visits?activeOnly=true|false — the Triage Board's data source. */
export async function listErVisits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const activeOnly = req.query.activeOnly === "false" ? false : true;
    const visits = await emergencyService.listErVisits({ activeOnly });
    res.status(200).json({ data: visits });
  } catch (err) {
    next(err);
  }
}

/** GET /api/emergency/bays — every ER bay/crash cart with its live status. */
export async function listErBays(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const bays = await emergencyService.listErBays();
    res.status(200).json({ data: bays });
  } catch (err) {
    next(err);
  }
}

const RegisterErVisitSchema = z
  .object({
    patientId: z.string().min(1),
    chiefComplaint: z.string().min(1).max(500),
    arrivalMode: z.nativeEnum(ERArrivalMode),
    triagePriority: z.nativeEnum(TriagePriority),
    triageNotes: z.string().max(1000).optional(),
    isMedicoLegalCase: z.boolean(),
    mlcNumber: z.string().max(100).optional(),
    policeStationName: z.string().max(150).optional(),
    mlcRemarks: z.string().max(1000).optional(),
  })
  .strict();

/** POST /api/emergency/visits — registers and triages a new ER arrival. */
export async function registerErVisit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const parsed = RegisterErVisitSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const visit = await emergencyService.registerErVisit({ ...parsed.data, performedByUserId: req.user.id });
    res.status(201).json({ data: visit });
  } catch (err) {
    next(err);
  }
}

const AssignBaySchema = z.object({ bayId: z.string().min(1) }).strict();

/** POST /api/emergency/visits/:erVisitId/assign-bay — rapid bay/crash-cart allocation. */
export async function assignBay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { erVisitId } = req.params;
    if (!erVisitId) throw new ValidationError("erVisitId route parameter is required");
    const parsed = AssignBaySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const result = await emergencyService.assignBay({ erVisitId, bayId: parsed.data.bayId, performedByUserId: req.user.id });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

const PrimaryAssessmentSchema = z
  .object({
    airwayStatus: z.nativeEnum(AirwayStatus),
    airwayNotes: z.string().max(500).optional(),
    breathingRatePerMin: z.number().min(0).max(100).optional(),
    breathingSpo2Percent: z.number().min(0).max(100).optional(),
    breathingNotes: z.string().max(500).optional(),
    circulationPulseRatePerMin: z.number().min(0).max(300).optional(),
    circulationSystolicBP: z.number().min(0).max(300).optional(),
    circulationDiastolicBP: z.number().min(0).max(200).optional(),
    circulationCapillaryRefillSec: z.number().min(0).max(30).optional(),
    circulationNotes: z.string().max(500).optional(),
    disabilityGcsScore: z.number().min(3).max(15).optional(),
    disabilityPupilResponse: z.string().max(200).optional(),
    disabilityNotes: z.string().max(500).optional(),
    exposureNotes: z.string().max(500).optional(),
    overallImpression: z.string().max(1000).optional(),
  })
  .strict();

/** POST /api/emergency/visits/:erVisitId/primary-assessment — records one ABCDE reassessment. */
export async function recordPrimaryAssessment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { erVisitId } = req.params;
    if (!erVisitId) throw new ValidationError("erVisitId route parameter is required");
    const parsed = PrimaryAssessmentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const entry = await emergencyService.recordPrimaryAssessment({ erVisitId, ...parsed.data, performedByUserId: req.user.id });
    res.status(201).json({ data: entry });
  } catch (err) {
    next(err);
  }
}

/** GET /api/emergency/visits/:erVisitId/primary-assessment — the resuscitation timeline for one visit. */
export async function getEmergencyEmrHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { erVisitId } = req.params;
    if (!erVisitId) throw new ValidationError("erVisitId route parameter is required");
    const history = await emergencyService.getEmergencyEmrHistory(erVisitId);
    res.status(200).json({ data: history });
  } catch (err) {
    next(err);
  }
}

const ConvertToAdmissionSchema = z
  .object({
    bedId: z.string().min(1),
    attendingDoctorId: z.string().min(1),
    provisionalDiagnosis: z.string().min(1).max(1000),
    guardianConsentObtained: z.boolean().optional(),
  })
  .strict();

/** POST /api/emergency/visits/:erVisitId/convert-to-admission — the Triage Board's one-click "Admit to IPD" button. */
export async function convertToIpdAdmission(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { erVisitId } = req.params;
    if (!erVisitId) throw new ValidationError("erVisitId route parameter is required");
    const parsed = ConvertToAdmissionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const result = await emergencyService.convertToIpdAdmission({ erVisitId, ...parsed.data, performedByUserId: req.user.id });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

const DischargeErVisitSchema = z
  .object({
    status: z.nativeEnum(ERVisitStatus),
    dispositionNotes: z.string().max(1000).optional(),
  })
  .strict();

/** POST /api/emergency/visits/:erVisitId/discharge — closes a visit that ends without becoming an admission. */
export async function dischargeErVisit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { erVisitId } = req.params;
    if (!erVisitId) throw new ValidationError("erVisitId route parameter is required");
    const parsed = DischargeErVisitSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const visit = await emergencyService.dischargeErVisit({ erVisitId, ...parsed.data, performedByUserId: req.user.id });
    res.status(200).json({ data: visit });
  } catch (err) {
    next(err);
  }
}

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { otService } from "../services/ot.service.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

const TeamMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["SURGEON", "ASSISTANT_SURGEON", "ANESTHETIST", "SCRUB_NURSE", "CIRCULATING_NURSE", "TECHNICIAN"]),
  name: z.string().min(1).max(150),
});

const ScheduleSurgerySchema = z.object({
  patientId: z.string().min(1),
  admissionId: z.string().optional(),
  theatreType: z.enum(["OT", "CATH_LAB"]),
  theatreRoom: z.string().min(1).max(100),
  procedureName: z.string().min(1).max(300),
  icd10ProcedureCodes: z.array(z.string().min(1)).optional(),
  team: z.array(TeamMemberSchema).min(1, "At least one team member is required"),
  scheduledStart: z.string().min(1),
  scheduledEnd: z.string().min(1),
  anesthesiaType: z.enum(["GENERAL", "REGIONAL", "LOCAL", "SEDATION", "NONE"]).optional(),
  consentObtained: z.boolean().optional(),
});

/**
 * POST /api/ot/surgeries — books a theatre slot via
 * `OTService.scheduleSurgery` (transactional double-booking guard). OT
 * Coordinator only.
 */
export async function scheduleSurgery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }

    const parsed = ScheduleSurgerySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    const surgery = await otService.scheduleSurgery({
      patientId: input.patientId,
      admissionId: input.admissionId,
      theatreType: input.theatreType,
      theatreRoom: input.theatreRoom,
      procedureName: input.procedureName,
      icd10ProcedureCodes: input.icd10ProcedureCodes,
      team: input.team,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      anesthesiaType: input.anesthesiaType,
      consentObtained: input.consentObtained,
      performedByUserId: req.user.id,
    });

    res.status(201).json({ data: surgery });
  } catch (err) {
    next(err);
  }
}

const InstrumentSetInputSchema = z.object({
  setName: z.string().min(1).max(150),
  setBarcodeValue: z.string().min(1).max(100),
});

const LogSterilizationSchema = z.object({
  autoclaveId: z.string().min(1).max(100),
  cycleType: z.enum(["STEAM", "ETO", "PLASMA", "DRY_HEAT"]),
  instrumentSets: z.array(InstrumentSetInputSchema).min(1, "At least one instrument set is required"),
  temperatureCelsius: z.number(),
  pressureKPa: z.number().optional(),
  durationMinutes: z.number().positive(),
  biologicalIndicatorResult: z.enum(["PASS", "FAIL", "PENDING"]),
  chemicalIndicatorResult: z.enum(["PASS", "FAIL"]),
  startedAt: z.string().min(1),
  completedAt: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * POST /api/ot/sterilization-logs — records one autoclave cycle via
 * `OTService.logSterilization`, which derives each instrument set's
 * OT-use eligibility from the overall biological/chemical indicator
 * result. OT Coordinator only.
 */
export async function logSterilization(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }

    const parsed = LogSterilizationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    const log = await otService.logSterilization({
      autoclaveId: input.autoclaveId,
      cycleType: input.cycleType,
      instrumentSets: input.instrumentSets,
      temperatureCelsius: input.temperatureCelsius,
      pressureKPa: input.pressureKPa,
      durationMinutes: input.durationMinutes,
      biologicalIndicatorResult: input.biologicalIndicatorResult,
      chemicalIndicatorResult: input.chemicalIndicatorResult,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      notes: input.notes,
      performedByUserId: req.user.id,
    });

    res.status(201).json({ data: log });
  } catch (err) {
    next(err);
  }
}

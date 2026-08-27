import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Doctor } from "../models/opd/Doctor.model.js";
import { emrService } from "../services/emr.service.js";
import { EncounterType, DrugRoute, ICD10_CODE_REGEX } from "../types/common.types.js";
import { AuthenticationError, ValidationError, ForbiddenError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

/** Every EMR-writing endpoint resolves the acting Doctor from the authenticated user rather than trusting a client-supplied doctorId, so a doctor account can only ever write notes/prescriptions under its own name. */
async function requireDoctorProfile(userId: string) {
  const doctor = await Doctor.findOne({ userId, isActive: true }).lean();
  if (!doctor) {
    throw new ForbiddenError("No active doctor profile is linked to this account");
  }
  return doctor;
}

const DiagnosisInputSchema = z.object({
  icd10Code: z.string().regex(ICD10_CODE_REGEX, "Invalid ICD-10 code"),
  icd10Description: z.string().min(1).max(500),
  diagnosisType: z.enum(["PROVISIONAL", "CONFIRMED", "DIFFERENTIAL", "RULED_OUT"]),
  isChronic: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

const AddClinicalNoteSchema = z.object({
  encounterType: z.nativeEnum(EncounterType),
  opdVisitId: z.string().optional(),
  admissionId: z.string().optional(),
  subjective: z.string().min(1),
  objective: z.string().min(1),
  assessment: z.string().min(1),
  plan: z.string().min(1),
  diagnoses: z.array(DiagnosisInputSchema).optional().default([]),
  isSigned: z.boolean().optional(),
});

/**
 * POST /api/emr/:patientId/notes — doctor adds SOAP clinical notes plus
 * any ICD-10 diagnoses for this encounter, via `EMRService.addClinicalNote`
 * (transactional: note + diagnoses commit together). Doctor only.
 */
export async function addClinicalNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }
    const { patientId } = req.params;
    if (!patientId) {
      throw new ValidationError("patientId route parameter is required");
    }

    const parsed = AddClinicalNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    const doctor = await requireDoctorProfile(req.user.id);

    const note = await emrService.addClinicalNote({
      patientId,
      doctorId: doctor._id.toString(),
      encounterType: input.encounterType,
      opdVisitId: input.opdVisitId,
      admissionId: input.admissionId,
      subjective: input.subjective,
      objective: input.objective,
      assessment: input.assessment,
      plan: input.plan,
      diagnoses: input.diagnoses,
      isSigned: input.isSigned,
      performedByUserId: req.user.id,
    });

    res.status(201).json({ data: note });
  } catch (err) {
    next(err);
  }
}

const PrescriptionItemInputSchema = z.object({
  drugId: z.string().min(1),
  doseValue: z.number().positive(),
  doseUnit: z.enum(["mg", "mcg", "g", "ml", "IU", "tablet", "drop", "puff"]),
  route: z.nativeEnum(DrugRoute),
  frequencyPerDay: z.number().int().min(1).max(24),
  durationDays: z.number().int().min(1),
  isPRN: z.boolean().optional(),
  instructions: z.string().max(300).optional(),
});

const AddPrescriptionSchema = z
  .object({
    clinicalNoteId: z.string().min(1),
    encounterType: z.enum(["OPD", "IPD"]),
    items: z.array(PrescriptionItemInputSchema).min(1, "At least one medication item is required"),
    allergyOverride: z.boolean().optional(),
    allergyOverrideReason: z.string().max(500).optional(),
  })
  .refine((data) => !data.allergyOverride || Boolean(data.allergyOverrideReason?.trim()), {
    message: "allergyOverrideReason is required when allergyOverride is true",
    path: ["allergyOverrideReason"],
  });

/**
 * POST /api/emr/:patientId/prescriptions — doctor writes an electronic
 * prescription (drug, dosage, frequency, duration); quantity to dispense
 * is computed server-side by the dosage calculator in
 * `EMRService.addPrescription`. Doctor only.
 */
export async function addPrescription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }
    const { patientId } = req.params;
    if (!patientId) {
      throw new ValidationError("patientId route parameter is required");
    }

    const parsed = AddPrescriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    const doctor = await requireDoctorProfile(req.user.id);

    const prescription = await emrService.addPrescription({
      patientId,
      doctorId: doctor._id.toString(),
      clinicalNoteId: input.clinicalNoteId,
      encounterType: input.encounterType,
      items: input.items,
      allergyOverride: input.allergyOverride,
      allergyOverrideReason: input.allergyOverrideReason,
      performedByUserId: req.user.id,
    });

    res.status(201).json({ data: prescription });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emr/:patientId/timeline — the consolidated, chronologically
 * merged medical history view (OPD visits, admissions, notes, diagnoses,
 * prescriptions, lab orders, discharge summaries).
 */
export async function getPatientTimeline(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { patientId } = req.params;
    if (!patientId) {
      throw new ValidationError("patientId route parameter is required");
    }

    const timeline = await emrService.getPatientTimeline(patientId);
    res.status(200).json({ data: timeline });
  } catch (err) {
    next(err);
  }
}

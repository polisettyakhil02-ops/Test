import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Patient, generateUHID } from "../models/mpi/Patient.model.js";
import { opdService } from "../services/opd.service.js";
import { Gender, BloodGroup, MaritalStatus, PHONE_REGEX, EMAIL_REGEX } from "../types/common.types.js";
import { AuthenticationError, ValidationError, NotFoundError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

const AddressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
});

const EmergencyContactSchema = z.object({
  name: z.string().min(1).max(150),
  relationship: z.string().min(1).max(50),
  phone: z.string().regex(PHONE_REGEX, "Invalid phone number"),
  alternatePhone: z.string().regex(PHONE_REGEX, "Invalid phone number").optional(),
  address: AddressSchema.optional(),
});

const RegisterPatientSchema = z.object({
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.coerce.date(),
  isDateOfBirthEstimated: z.boolean().optional().default(false),
  gender: z.nativeEnum(Gender),
  bloodGroup: z.nativeEnum(BloodGroup).optional().default(BloodGroup.UNKNOWN),
  maritalStatus: z.nativeEnum(MaritalStatus).optional().default(MaritalStatus.UNKNOWN),
  phone: z.string().regex(PHONE_REGEX, "Invalid phone number"),
  alternatePhone: z.string().regex(PHONE_REGEX, "Invalid phone number").optional(),
  email: z.string().regex(EMAIL_REGEX, "Invalid email").optional(),
  address: AddressSchema,
  emergencyContacts: z.array(EmergencyContactSchema).min(1, "At least one emergency contact is required"),
  fatherOrHusbandName: z.string().max(150).optional(),
  occupation: z.string().max(100).optional(),
  nationality: z.string().min(1).optional().default("IN"),
  preferredLanguage: z.string().optional(),
});

/**
 * POST /api/patients — registers a new patient in the Master Patient
 * Index and mints its UHID (Redis-backed atomic counter, see
 * `generateUHID()`). Receptionist/Admin only, per route-level RBAC.
 */
export async function registerPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }

    const parsed = RegisterPatientSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    const uhid = await generateUHID();
    const patient = await Patient.create({
      uhid,
      ...input,
      idProofs: [],
      biometrics: [],
      insuranceDetails: [],
      isActive: true,
      isDeceased: false,
      createdBy: req.user.id,
    });

    res.status(201).json({ data: patient });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/patients/:uhid — demographics + emergency contacts lookup used
 * at reception, the nurse station, and the doctor desk alike.
 */
export async function getPatientByUhid(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { uhid } = req.params;
    if (!uhid) {
      throw new ValidationError("uhid route parameter is required");
    }

    const patient = await Patient.findOne({ uhid }).lean();
    if (!patient) {
      throw new NotFoundError(`No patient found with UHID ${uhid}`);
    }

    res.status(200).json({ data: patient });
  } catch (err) {
    next(err);
  }
}

const BookAppointmentSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  visitDate: z.string().min(1).optional(),
  isFollowUp: z.boolean().optional(),
  chiefComplaint: z.string().min(1).max(1000),
  priority: z.enum(["NORMAL", "SENIOR_CITIZEN", "EMERGENCY", "VIP"]).optional(),
});

/**
 * POST /api/appointments — books an OPD slot for a doctor, issuing the
 * next queue token for that doctor's day via `OPDService.bookAppointment`
 * (Redis-backed counter + OPDVisit created in one transaction).
 */
export async function bookAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }

    const parsed = BookAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    const result = await opdService.bookAppointment({
      patientId: input.patientId,
      doctorId: input.doctorId,
      visitDate: input.visitDate,
      isFollowUp: input.isFollowUp,
      chiefComplaint: input.chiefComplaint,
      priority: input.priority,
      performedByUserId: req.user.id,
    });

    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

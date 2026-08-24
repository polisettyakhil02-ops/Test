import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { bloodBankService } from "../services/bloodbank.service.js";
import { Gender, BloodGroup, BloodComponentType, CrossMatchStatus } from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

const RegisterDonorSchema = z
  .object({
    fullName: z.string().min(1).max(150),
    age: z.number().min(18).max(65),
    gender: z.nativeEnum(Gender),
    bloodGroup: z.nativeEnum(BloodGroup),
    phone: z.string().min(1),
    address: z.string().max(300).optional(),
    medicalNotes: z.string().max(1000).optional(),
  })
  .strict();

/** POST /api/bloodbank/donors — registers a donor ahead of, or at, a donation camp. */
export async function registerDonor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const parsed = RegisterDonorSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const donor = await bloodBankService.registerDonor({ ...parsed.data, performedByUserId: req.user.id });
    res.status(201).json({ data: donor });
  } catch (err) {
    next(err);
  }
}

/** GET /api/bloodbank/donors?bloodGroup= — the donor camp roster. */
export async function listDonors(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const bloodGroup = typeof req.query.bloodGroup === "string" ? (req.query.bloodGroup as BloodGroup) : undefined;
    const donors = await bloodBankService.listDonors({ bloodGroup });
    res.status(200).json({ data: donors });
  } catch (err) {
    next(err);
  }
}

const LogDonationSchema = z
  .object({
    componentType: z.nativeEnum(BloodComponentType),
    volumeMl: z.number().positive(),
    collectionDate: z.string().min(1),
    storageLocation: z.string().min(1).max(150),
    screeningTestsPassed: z.boolean(),
  })
  .strict();

/** POST /api/bloodbank/donors/:donorId/donations — logs a collection and mints the resulting blood bag(s). */
export async function logDonation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { donorId } = req.params;
    if (!donorId) throw new ValidationError("donorId route parameter is required");
    const parsed = LogDonationSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const result = await bloodBankService.logDonation({ donorId, ...parsed.data, performedByUserId: req.user.id });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** GET /api/bloodbank/inventory?bloodGroup=&componentType= — live-status inventory grid. */
export async function listInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const bloodGroup = typeof req.query.bloodGroup === "string" ? (req.query.bloodGroup as BloodGroup) : undefined;
    const componentType =
      typeof req.query.componentType === "string" ? (req.query.componentType as BloodComponentType) : undefined;
    const rows = await bloodBankService.listInventory({ bloodGroup, componentType });
    res.status(200).json({ data: rows });
  } catch (err) {
    next(err);
  }
}

const RaiseCrossMatchRequestSchema = z
  .object({
    patientId: z.string().min(1),
    admissionId: z.string().optional(),
    bloodGroupRequired: z.nativeEnum(BloodGroup),
    componentType: z.nativeEnum(BloodComponentType),
    unitsRequired: z.number().int().min(1).max(20),
    urgent: z.boolean().optional(),
  })
  .strict();

/** POST /api/bloodbank/crossmatch-requests — a ward's request for compatibility-tested blood. */
export async function raiseCrossMatchRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const parsed = RaiseCrossMatchRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const request = await bloodBankService.raiseCrossMatchRequest({ ...parsed.data, performedByUserId: req.user.id });
    res.status(201).json({ data: request });
  } catch (err) {
    next(err);
  }
}

/** GET /api/bloodbank/crossmatch-requests?status= — the ward-request worklist. */
export async function listCrossMatchRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === "string" ? (req.query.status as CrossMatchStatus) : undefined;
    const requests = await bloodBankService.listCrossMatchRequests({ status });
    res.status(200).json({ data: requests });
  } catch (err) {
    next(err);
  }
}

const PerformCrossMatchSchema = z
  .object({
    compatible: z.boolean(),
    resultNotes: z.string().max(1000).optional(),
  })
  .strict();

/** POST /api/bloodbank/crossmatch-requests/:requestId/perform — records the lab's compatibility result and reserves units on a COMPATIBLE outcome. */
export async function performCrossMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { requestId } = req.params;
    if (!requestId) throw new ValidationError("requestId route parameter is required");
    const parsed = PerformCrossMatchSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const request = await bloodBankService.performCrossMatch({
      crossMatchRequestId: requestId,
      ...parsed.data,
      performedByUserId: req.user.id,
    });
    res.status(200).json({ data: request });
  } catch (err) {
    next(err);
  }
}

const DispenseBloodBagSchema = z
  .object({
    bagId: z.string().min(1),
    admissionId: z.string().min(1),
  })
  .strict();

/** POST /api/bloodbank/crossmatch-requests/:requestId/dispense — issues one reserved unit; rejects an INCOMPATIBLE request or an expired bag. */
export async function dispenseBloodBag(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { requestId } = req.params;
    if (!requestId) throw new ValidationError("requestId route parameter is required");
    const parsed = DispenseBloodBagSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const result = await bloodBankService.dispenseBloodBag({
      crossMatchRequestId: requestId,
      ...parsed.data,
      performedByUserId: req.user.id,
    });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

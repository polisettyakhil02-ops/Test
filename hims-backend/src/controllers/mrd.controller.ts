import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { mrdService } from "../services/mrd.service.js";
import { ICD10_CODE_REGEX, MrdArchiveStatus, IcdCodingStatus, MrdFileRequestType, MrdFileRequestStatus } from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

function requireUser(req: Request): string {
  if (!req.user) throw new AuthenticationError("Must be authenticated");
  return req.user.id;
}

/** GET /api/mrd/eligible-admissions — discharged admissions with no archive record yet. */
export async function listEligibleForArchiving(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const admissions = await mrdService.listEligibleForArchiving();
    res.status(200).json({ data: admissions });
  } catch (err) {
    next(err);
  }
}

const CreateArchiveSchema = z.object({
  admissionId: z.string().min(1),
  fileBarcodeId: z.string().min(1),
  physicalLocation: z.string().min(1),
});

export async function createArchiveRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = CreateArchiveSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const archive = await mrdService.createArchiveRecord({ ...parsed.data, performedByUserId });
    res.status(201).json({ data: archive });
  } catch (err) {
    next(err);
  }
}

export async function listArchives(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as MrdArchiveStatus) : undefined;
    const icdCodingStatus = typeof req.query.icdCodingStatus === "string" ? (req.query.icdCodingStatus as IcdCodingStatus) : undefined;
    const archives = await mrdService.listArchives({ patientId, status, icdCodingStatus });
    res.status(200).json({ data: archives });
  } catch (err) {
    next(err);
  }
}

/** GET /api/mrd/archives/pending-coding — the post-discharge ICD coding backlog dashboard. */
export async function listPendingCoding(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const archives = await mrdService.listPendingCoding();
    res.status(200).json({ data: archives });
  } catch (err) {
    next(err);
  }
}

/** GET /api/mrd/archives/barcode/:barcode — the File Tracker's barcode-scanner lookup. */
export async function getArchiveByBarcode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { barcode } = req.params;
    if (!barcode) throw new ValidationError("barcode route parameter is required");
    const archive = await mrdService.getArchiveByBarcode(barcode);
    res.status(200).json({ data: archive });
  } catch (err) {
    next(err);
  }
}

const BarcodeActionSchema = z.object({ fileBarcodeId: z.string().min(1), reason: z.string().min(1).optional() });

/** POST /api/mrd/archives/checkout — scans a physical file out of the archive room. */
export async function checkOutFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = BarcodeActionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    if (!parsed.data.reason?.trim()) throw new ValidationError("reason is required to check a file out");
    const archive = await mrdService.checkOutFile(parsed.data.fileBarcodeId, parsed.data.reason, performedByUserId);
    res.status(200).json({ data: archive });
  } catch (err) {
    next(err);
  }
}

/** POST /api/mrd/archives/checkin — scans a physical file back into the archive room. */
export async function checkInFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = z.object({ fileBarcodeId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const archive = await mrdService.checkInFile(parsed.data.fileBarcodeId, performedByUserId);
    res.status(200).json({ data: archive });
  } catch (err) {
    next(err);
  }
}

const IcdCodeEntrySchema = z.object({
  code: z.string().regex(ICD10_CODE_REGEX, "Invalid ICD-10 code"),
  description: z.string().min(1).max(500),
  isPrimary: z.boolean(),
});

const FinalizeCodingSchema = z.object({ icdCodes: z.array(IcdCodeEntrySchema).min(1) });

export async function finalizeIcdCoding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { archiveId } = req.params;
    if (!archiveId) throw new ValidationError("archiveId route parameter is required");
    const parsed = FinalizeCodingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const archive = await mrdService.finalizeIcdCoding({ archiveId, icdCodes: parsed.data.icdCodes, performedByUserId });
    res.status(200).json({ data: archive });
  } catch (err) {
    next(err);
  }
}

export async function flagIcdQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { archiveId } = req.params;
    if (!archiveId) throw new ValidationError("archiveId route parameter is required");
    const parsed = z.object({ note: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const archive = await mrdService.flagIcdQuery(archiveId, parsed.data.note);
    res.status(200).json({ data: archive });
  } catch (err) {
    next(err);
  }
}

const LogFileRequestSchema = z.object({
  requestType: z.nativeEnum(MrdFileRequestType),
  requestedByName: z.string().min(1).max(200),
  purpose: z.string().min(1).max(1000),
});

export async function logFileRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { archiveId } = req.params;
    if (!archiveId) throw new ValidationError("archiveId route parameter is required");
    const parsed = LogFileRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const archive = await mrdService.logFileRequest({ archiveId, ...parsed.data });
    res.status(201).json({ data: archive });
  } catch (err) {
    next(err);
  }
}

const ResolveFileRequestSchema = z.object({
  status: z.enum(["FULFILLED", "DENIED"]),
  denialReason: z.string().max(500).optional(),
});

export async function resolveFileRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { archiveId, requestId } = req.params;
    if (!archiveId || !requestId) throw new ValidationError("archiveId and requestId route parameters are required");
    const parsed = ResolveFileRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const archive = await mrdService.resolveFileRequest(
      archiveId,
      requestId,
      {
        status: parsed.data.status === "FULFILLED" ? MrdFileRequestStatus.FULFILLED : MrdFileRequestStatus.DENIED,
        denialReason: parsed.data.denialReason,
      },
      performedByUserId,
    );
    res.status(200).json({ data: archive });
  } catch (err) {
    next(err);
  }
}

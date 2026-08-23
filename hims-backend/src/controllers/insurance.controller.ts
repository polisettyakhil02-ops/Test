import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { insuranceService } from "../services/insurance.service.js";
import { PreAuthStatus } from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

/** GET /api/insurance/claims?status= — the TPA desk's Kanban board data. */
export async function listClaims(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === "string" ? (req.query.status as PreAuthStatus) : undefined;
    const claims = await insuranceService.listClaims({ status });
    res.status(200).json({ data: claims });
  } catch (err) {
    next(err);
  }
}

const RaiseClaimSchema = z
  .object({
    admissionId: z.string().min(1),
    insurancePolicyId: z.string().min(1),
    requestedAmount: z.number().positive(),
    provisionalDiagnosis: z.string().min(1).max(1000),
    treatingDoctorId: z.string().min(1),
    estimatedLengthOfStayDays: z.number().min(0).optional(),
  })
  .strict();

/** POST /api/insurance/claims — opens a new cashless pre-authorization request. */
export async function raiseClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const parsed = RaiseClaimSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const claim = await insuranceService.raiseClaim(parsed.data, req.user.id);
    res.status(201).json({ data: claim });
  } catch (err) {
    next(err);
  }
}

const RespondSchema = z
  .object({
    status: z.enum(["APPROVED", "PARTIALLY_APPROVED", "REJECTED"]),
    approvedAmount: z.number().positive().optional(),
    rejectionReason: z.string().max(1000).optional(),
    tpaReferenceNumber: z.string().max(100).optional(),
  })
  .strict();

/** POST /api/insurance/claims/:preAuthId/respond — the TPA officer's approve/partially-approve/reject decision. */
export async function respondToPreAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { preAuthId } = req.params;
    if (!preAuthId) throw new ValidationError("preAuthId route parameter is required");
    const parsed = RespondSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const claim = await insuranceService.respondToPreAuth({ preAuthId, ...parsed.data });
    res.status(200).json({ data: claim });
  } catch (err) {
    next(err);
  }
}

const QueryTextSchema = z.object({ text: z.string().min(1).max(1000) }).strict();

/** POST /api/insurance/claims/:preAuthId/query — the TPA officer raises a query on the claim. */
export async function raiseQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { preAuthId } = req.params;
    if (!preAuthId) throw new ValidationError("preAuthId route parameter is required");
    const parsed = QueryTextSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const claim = await insuranceService.raiseQuery(preAuthId, parsed.data.text);
    res.status(200).json({ data: claim });
  } catch (err) {
    next(err);
  }
}

/** POST /api/insurance/claims/:preAuthId/query-response — hospital staff answers the TPA's open query. */
export async function respondToQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { preAuthId } = req.params;
    if (!preAuthId) throw new ValidationError("preAuthId route parameter is required");
    const parsed = QueryTextSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const claim = await insuranceService.respondToQuery(preAuthId, parsed.data.text, req.user.id);
    res.status(200).json({ data: claim });
  } catch (err) {
    next(err);
  }
}

const SettleClaimSchema = z.object({ invoiceId: z.string().min(1) }).strict();

/** POST /api/insurance/claims/:preAuthId/settle — splits the invoice into TPA-covered and patient co-pay amounts and posts the TPA's share as a Payment. */
export async function settleClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { preAuthId } = req.params;
    if (!preAuthId) throw new ValidationError("preAuthId route parameter is required");
    const parsed = SettleClaimSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const result = await insuranceService.settleClaim({ preAuthId, invoiceId: parsed.data.invoiceId }, req.user.id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

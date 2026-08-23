import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { assetService } from "../services/asset.service.js";
import {
  AssetCategory,
  AssetStatus,
  AssetCriticality,
  AmcCoverageType,
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
} from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

/** GET /api/assets — the biomedical dashboard's device grid, each row carrying a derived AMC status alongside the raw asset. */
export async function listAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === "string" ? (req.query.status as AssetStatus) : undefined;
    const category = typeof req.query.category === "string" ? (req.query.category as AssetCategory) : undefined;
    const rows = await assetService.listAssets({ status, category });
    res.status(200).json({ data: rows });
  } catch (err) {
    next(err);
  }
}

const CreateAssetSchema = z
  .object({
    name: z.string().min(1).max(200),
    category: z.nativeEnum(AssetCategory),
    manufacturer: z.string().min(1).max(150),
    modelNumber: z.string().min(1).max(100),
    serialNumber: z.string().min(1).max(100),
    departmentId: z.string().min(1),
    location: z.string().min(1).max(150),
    purchaseDate: z.string().min(1),
    purchasePrice: z.number().min(0),
    warrantyExpiryDate: z.string().optional(),
    criticality: z.nativeEnum(AssetCriticality).optional(),
    amcVendor: z.string().max(150).optional(),
    amcContractNumber: z.string().max(100).optional(),
    amcCoverageType: z.nativeEnum(AmcCoverageType).optional(),
    amcStartDate: z.string().optional(),
    amcEndDate: z.string().optional(),
  })
  .strict();

/** POST /api/assets — onboards a new tracked device. */
export async function createAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const parsed = CreateAssetSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const asset = await assetService.createAsset(parsed.data);
    res.status(201).json({ data: asset });
  } catch (err) {
    next(err);
  }
}

/** GET /api/assets/tickets — the maintenance worklist across every asset. */
export async function listMaintenanceTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === "string" ? (req.query.status as MaintenanceTicketStatus) : undefined;
    const tickets = await assetService.listMaintenanceTickets({ status });
    res.status(200).json({ data: tickets });
  } catch (err) {
    next(err);
  }
}

const LogBreakdownSchema = z
  .object({
    reportedIssue: z.string().min(1).max(1000),
    priority: z.nativeEnum(MaintenanceTicketPriority).optional(),
  })
  .strict();

/** POST /api/assets/:assetId/breakdown — logs a fault and takes the device out of service. */
export async function logBreakdown(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { assetId } = req.params;
    if (!assetId) throw new ValidationError("assetId route parameter is required");
    const parsed = LogBreakdownSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const result = await assetService.logBreakdownTicket(
      { assetId, reportedIssue: parsed.data.reportedIssue, priority: parsed.data.priority },
      req.user.id,
    );
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

const SchedulePmSchema = z
  .object({
    scheduledDate: z.string().min(1),
    assignedVendor: z.string().max(150).optional(),
    assignedTechnician: z.string().max(150).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

/** POST /api/assets/:assetId/pm-schedule — books a future preventive maintenance visit. */
export async function schedulePreventiveMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { assetId } = req.params;
    if (!assetId) throw new ValidationError("assetId route parameter is required");
    const parsed = SchedulePmSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const result = await assetService.schedulePreventiveMaintenance({ assetId, ...parsed.data }, req.user.id);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

const ResolveTicketSchema = z
  .object({
    resolutionNotes: z.string().min(1).max(2000),
    cost: z.number().min(0).optional(),
  })
  .strict();

/** POST /api/assets/tickets/:ticketId/resolve — closes out a ticket and, once every open breakdown on the device is clear, returns it to ACTIVE. */
export async function resolveMaintenanceTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { ticketId } = req.params;
    if (!ticketId) throw new ValidationError("ticketId route parameter is required");
    const parsed = ResolveTicketSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const result = await assetService.resolveMaintenanceTicket({ ticketId, ...parsed.data }, req.user.id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

const RenewAmcSchema = z
  .object({
    amcVendor: z.string().min(1).max(150),
    amcContractNumber: z.string().min(1).max(100),
    amcCoverageType: z.nativeEnum(AmcCoverageType),
    amcStartDate: z.string().min(1),
    amcEndDate: z.string().min(1),
  })
  .strict();

/** POST /api/assets/:assetId/amc-renew — records a fresh AMC/CMC contract term. */
export async function renewAmc(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { assetId } = req.params;
    if (!assetId) throw new ValidationError("assetId route parameter is required");
    const parsed = RenewAmcSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const asset = await assetService.renewAmcContract({ assetId, ...parsed.data });
    res.status(200).json({ data: asset });
  } catch (err) {
    next(err);
  }
}

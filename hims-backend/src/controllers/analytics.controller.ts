import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as analyticsService from "../services/analytics.service.js";
import { ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

const DateRangeQuerySchema = z.object({ startDate: z.string().min(1), endDate: z.string().min(1) });

function parseDateRange(req: Request): { startDate: string; endDate: string } {
  const parsed = DateRangeQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  return parsed.data;
}

function parseLimit(req: Request, fallback: number): number {
  const raw = req.query.limit;
  if (typeof raw !== "string") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function getOpdWaitingTimeStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const range = parseDateRange(req);
    const data = await analyticsService.getOpdWaitingTimeStats(range);
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getIcuBounceBackRate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const range = parseDateRange(req);
    const data = await analyticsService.getIcuBounceBackRate(range);
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getSurgicalSiteInfectionRate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const range = parseDateRange(req);
    const data = await analyticsService.getSurgicalSiteInfectionRate(range);
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getDepartmentProfitability(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const range = parseDateRange(req);
    const data = await analyticsService.getDepartmentProfitability(range);
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getTopRevenueGeneratingDoctors(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const range = parseDateRange(req);
    const limit = parseLimit(req, 10);
    const data = await analyticsService.getTopRevenueGeneratingDoctors(range, limit);
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getPharmacyWastage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const range = parseDateRange(req);
    const limit = parseLimit(req, 10);
    const data = await analyticsService.getPharmacyWastage(range, limit);
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
}

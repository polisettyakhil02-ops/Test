import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as mobileService from "../services/mobile.service.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

function requireUser(req: Request): string {
  if (!req.user) throw new AuthenticationError("Must be authenticated");
  return req.user.id;
}

const MobileLoginSchema = z.object({ username: z.string().min(1), password: z.string().min(1), deviceId: z.string().min(1) });

/** POST /api/mobile/auth/login — issues a strictly mobile-scoped access token (see utils/jwt.ts). Not gated by protectMobile itself, obviously — this is where a token comes from. */
export async function mobileLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = MobileLoginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const result = await mobileService.mobileLogin({
      ...parsed.data,
      ipAddress: req.ip ?? "unknown",
      userAgent: req.headers["user-agent"],
    });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** GET /api/mobile/patient/appointments — Patient App. */
export async function listMyAppointments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUser(req);
    const appointments = await mobileService.listMyAppointments(userId);
    res.status(200).json({ data: appointments });
  } catch (err) {
    next(err);
  }
}

const BookAppointmentSchema = z.object({
  doctorId: z.string().min(1),
  visitDate: z.string().optional(),
  chiefComplaint: z.string().min(1),
  isFollowUp: z.boolean().optional(),
});

/** POST /api/mobile/patient/appointments — Patient App booking flow. */
export async function bookMyAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUser(req);
    const parsed = BookAppointmentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const appointment = await mobileService.bookMyAppointment(userId, parsed.data);
    res.status(201).json({ data: appointment });
  } catch (err) {
    next(err);
  }
}

/** GET /api/mobile/doctor/ipd-rounds — Doctor App. */
export async function listMyIpdRounds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUser(req);
    const rounds = await mobileService.listMyIpdRounds(userId);
    res.status(200).json({ data: rounds });
  } catch (err) {
    next(err);
  }
}

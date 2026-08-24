import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { complaintsService } from "../services/complaints.service.js";
import { TicketCategory, TicketPriority, TicketStatus } from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

function requireUser(req: Request): string {
  if (!req.user) throw new AuthenticationError("Must be authenticated");
  return req.user.id;
}

const CreateTicketSchema = z.object({
  category: z.nativeEnum(TicketCategory),
  priority: z.nativeEnum(TicketPriority).optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  locationDescription: z.string().max(200).optional(),
  patientId: z.string().optional(),
  raisedByName: z.string().min(1),
});

export async function createTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = CreateTicketSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const ticket = await complaintsService.createTicket({ ...parsed.data, performedByUserId });
    res.status(201).json({ data: ticket });
  } catch (err) {
    next(err);
  }
}

export async function listTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === "string" ? (req.query.status as TicketStatus) : undefined;
    const category = typeof req.query.category === "string" ? (req.query.category as TicketCategory) : undefined;
    const assignedToUserId = typeof req.query.assignedToUserId === "string" ? req.query.assignedToUserId : undefined;
    const tickets = await complaintsService.listTickets({ status, category, assignedToUserId });
    res.status(200).json({ data: tickets });
  } catch (err) {
    next(err);
  }
}

export async function getTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ticketId } = req.params;
    if (!ticketId) throw new ValidationError("ticketId route parameter is required");
    const ticket = await complaintsService.getTicket(ticketId);
    res.status(200).json({ data: ticket });
  } catch (err) {
    next(err);
  }
}

export async function assignTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { ticketId } = req.params;
    if (!ticketId) throw new ValidationError("ticketId route parameter is required");
    const parsed = z.object({ assignedToUserId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const ticket = await complaintsService.assignTicket(ticketId, parsed.data.assignedToUserId);
    res.status(200).json({ data: ticket });
  } catch (err) {
    next(err);
  }
}

export async function startTicketProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { ticketId } = req.params;
    if (!ticketId) throw new ValidationError("ticketId route parameter is required");
    const ticket = await complaintsService.startProgress(ticketId);
    res.status(200).json({ data: ticket });
  } catch (err) {
    next(err);
  }
}

export async function resolveTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { ticketId } = req.params;
    if (!ticketId) throw new ValidationError("ticketId route parameter is required");
    const parsed = z.object({ resolutionNotes: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const ticket = await complaintsService.resolveTicket(ticketId, parsed.data.resolutionNotes);
    res.status(200).json({ data: ticket });
  } catch (err) {
    next(err);
  }
}

export async function closeTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { ticketId } = req.params;
    if (!ticketId) throw new ValidationError("ticketId route parameter is required");
    const ticket = await complaintsService.closeTicket(ticketId);
    res.status(200).json({ data: ticket });
  } catch (err) {
    next(err);
  }
}

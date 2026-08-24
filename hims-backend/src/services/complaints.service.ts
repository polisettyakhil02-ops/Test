import { Ticket, type TicketDocument } from "../models/complaints/Ticket.model.js";
import { TicketCategory, TicketPriority, TicketStatus } from "../types/common.types.js";
import { generateTicketNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors.js";

export interface CreateTicketInput {
  category: TicketCategory;
  priority?: TicketPriority;
  title: string;
  description: string;
  locationDescription?: string;
  patientId?: string;
  raisedByName: string;
  performedByUserId: string;
}

/**
 * The Facility Manager's Kanban board: `Ticket` walks
 * OPEN -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED, one explicit
 * transition method per column move (the same style every other
 * state-machine service in this codebase uses) rather than one generic
 * "setStatus" call, so each move can enforce its own precondition and
 * side effect (assigning stamps `assignedAt`; resolving stamps
 * `resolutionMinutes`). Single-document writes throughout — no
 * `withTransaction` needed.
 */
export class ComplaintsService {
  async createTicket(input: CreateTicketInput): Promise<TicketDocument> {
    if (!input.title.trim()) throw new ValidationError("title is required");
    if (!input.description.trim()) throw new ValidationError("description is required");
    if (input.category === TicketCategory.PATIENT_GRIEVANCE && !input.patientId) {
      throw new ValidationError("patientId is required for a PATIENT_GRIEVANCE ticket");
    }

    const ticketNumber = await generateTicketNumber();
    return Ticket.create({
      ticketNumber,
      category: input.category,
      priority: input.priority ?? TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      title: input.title.trim(),
      description: input.description.trim(),
      locationDescription: input.locationDescription,
      patientId: input.patientId ? toObjectId(input.patientId, "patientId") : undefined,
      raisedByUserId: input.performedByUserId,
      raisedByName: input.raisedByName,
      createdBy: input.performedByUserId,
    });
  }

  async assignTicket(ticketId: string, assignedToUserId: string): Promise<TicketDocument> {
    if (!assignedToUserId.trim()) throw new ValidationError("assignedToUserId is required");
    const ticket = await Ticket.findById(toObjectId(ticketId, "ticketId"));
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED) {
      throw new ConflictError(`Ticket ${ticket.ticketNumber} is ${ticket.status} and cannot be reassigned`);
    }
    ticket.assignedToUserId = assignedToUserId.trim();
    ticket.assignedAt = new Date();
    ticket.status = TicketStatus.ASSIGNED;
    await ticket.save();
    return ticket;
  }

  async startProgress(ticketId: string): Promise<TicketDocument> {
    const ticket = await Ticket.findById(toObjectId(ticketId, "ticketId"));
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticket.status !== TicketStatus.ASSIGNED) {
      throw new ConflictError(`Ticket ${ticket.ticketNumber} is ${ticket.status}, not ASSIGNED`);
    }
    ticket.status = TicketStatus.IN_PROGRESS;
    await ticket.save();
    return ticket;
  }

  async resolveTicket(ticketId: string, resolutionNotes: string): Promise<TicketDocument> {
    if (!resolutionNotes.trim()) throw new ValidationError("resolutionNotes is required");
    const ticket = await Ticket.findById(toObjectId(ticketId, "ticketId"));
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticket.status !== TicketStatus.IN_PROGRESS) {
      throw new ConflictError(`Ticket ${ticket.ticketNumber} is ${ticket.status}, not IN_PROGRESS`);
    }
    const resolvedAt = new Date();
    // `TicketAttrs` doesn't declare `createdAt` (added at runtime by `timestamps: true`,
    // per this codebase's convention — see Step 13's identical note on `Specimen`), so the
    // raised time is read off the ObjectId's own embedded creation timestamp instead.
    const raisedAt = ticket._id.getTimestamp();
    ticket.resolutionNotes = resolutionNotes.trim();
    ticket.resolvedAt = resolvedAt;
    ticket.resolutionMinutes = Math.round((resolvedAt.getTime() - raisedAt.getTime()) / 60000);
    ticket.status = TicketStatus.RESOLVED;
    await ticket.save();
    return ticket;
  }

  async closeTicket(ticketId: string): Promise<TicketDocument> {
    const ticket = await Ticket.findById(toObjectId(ticketId, "ticketId"));
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);
    if (ticket.status !== TicketStatus.RESOLVED) {
      throw new ConflictError(`Ticket ${ticket.ticketNumber} is ${ticket.status}, not RESOLVED`);
    }
    ticket.status = TicketStatus.CLOSED;
    ticket.closedAt = new Date();
    await ticket.save();
    return ticket;
  }

  async listTickets(filters: { status?: TicketStatus; category?: TicketCategory; assignedToUserId?: string } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    if (filters.assignedToUserId) query.assignedToUserId = filters.assignedToUserId;
    return Ticket.find(query).sort({ priority: 1, createdAt: 1 }).populate("patientId", "uhid firstName lastName");
  }

  async getTicket(ticketId: string): Promise<TicketDocument> {
    const ticket = await Ticket.findById(toObjectId(ticketId, "ticketId")).populate("patientId", "uhid firstName lastName");
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);
    return ticket;
  }
}

export const complaintsService = new ComplaintsService();

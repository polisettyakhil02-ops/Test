import type { TicketCategory, TicketPriority, TicketStatus } from "./common.types";

export interface TicketPatientSummary {
  _id: string;
  uhid: string;
  firstName: string;
  lastName: string;
}

/** Mirrors Ticket.model.ts — patientId arrives populated when set. */
export interface Ticket {
  _id: string;
  ticketNumber: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  title: string;
  description: string;
  locationDescription?: string;
  patientId?: TicketPatientSummary | string;
  raisedByUserId: string;
  raisedByName: string;
  assignedToUserId?: string;
  assignedAt?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  resolutionMinutes?: number;
  closedAt?: string;
  createdAt: string;
}

export interface CreateTicketPayload {
  category: TicketCategory;
  priority?: TicketPriority;
  title: string;
  description: string;
  locationDescription?: string;
  patientId?: string;
  raisedByName: string;
}

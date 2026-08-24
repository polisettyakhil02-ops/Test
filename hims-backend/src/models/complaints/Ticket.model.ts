import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { TicketCategory, TicketPriority, TicketStatus } from "../../types/common.types.js";

/**
 * One complaint/task on the Facility Manager's Kanban board — a broken
 * ICU AC (`FACILITY_MAINTENANCE`) and a patient's complaint about ward
 * service (`PATIENT_GRIEVANCE`) share the exact same assign/track/resolve
 * lifecycle, so one model covers both categories rather than two parallel
 * ones. `resolutionMinutes` is stamped once, at resolve time, rather than
 * always recomputed from `resolvedAt - createdAt` — resolution-time
 * reporting needs a stable historical number that a later edit to
 * `resolvedAt` (there shouldn't be one, but) can't silently reshape.
 */
export interface TicketAttrs {
  ticketNumber: string; // e.g. "TKT-2026-000318"
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  title: string;
  description: string;
  locationDescription?: string; // e.g. "ICU Bed 4", "3rd Floor Nurses Station" — mainly for FACILITY_MAINTENANCE
  patientId?: Types.ObjectId; // set when category is PATIENT_GRIEVANCE
  raisedByUserId: string;
  raisedByName: string; // denormalized snapshot — may be a staff member or someone raising it on a patient's behalf
  assignedToUserId?: string;
  assignedAt?: Date;
  resolutionNotes?: string;
  resolvedAt?: Date;
  resolutionMinutes?: number;
  closedAt?: Date;
  createdBy: string;
}

export type TicketDocument = HydratedDocument<TicketAttrs>;

const TicketSchema = new Schema<TicketAttrs>(
  {
    ticketNumber: { type: String, required: true, unique: true, immutable: true },
    category: { type: String, required: true, enum: Object.values(TicketCategory) },
    priority: { type: String, required: true, enum: Object.values(TicketPriority), default: TicketPriority.MEDIUM },
    status: { type: String, required: true, enum: Object.values(TicketStatus), default: TicketStatus.OPEN },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    locationDescription: { type: String, trim: true, maxlength: 200 },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient" },
    raisedByUserId: { type: String, required: true },
    raisedByName: { type: String, required: true, trim: true },
    assignedToUserId: { type: String },
    assignedAt: { type: Date },
    resolutionNotes: { type: String, trim: true, maxlength: 2000 },
    resolvedAt: { type: Date },
    resolutionMinutes: { type: Number, min: 0 },
    closedAt: { type: Date },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "tickets" },
);

// The Kanban board's primary read: group by status, most urgent/oldest first within a column.
TicketSchema.index({ status: 1, priority: 1, createdAt: 1 });
TicketSchema.index({ assignedToUserId: 1, status: 1 });
TicketSchema.index({ category: 1, createdAt: -1 });

export const Ticket: Model<TicketAttrs> = model<TicketAttrs>("Ticket", TicketSchema);

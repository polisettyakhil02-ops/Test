import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { MaintenanceTicketType, MaintenanceTicketStatus, MaintenanceTicketPriority } from "../../types/common.types.js";

/**
 * One service event against an `Asset` — either a scheduled Preventive
 * Maintenance (PM) visit or a reported Breakdown. Kept as its own
 * append-only-ish collection (not embedded on Asset) so the full service
 * history survives independently of the asset's current-state fields,
 * and so `AssetService.logBreakdownTicket`/`resolveMaintenanceTicket` can
 * each be a small, auditable transaction against two documents rather
 * than a growing embedded array needing its own pagination.
 */
export interface MaintenanceTicketAttrs {
  ticketNumber: string;
  assetId: Types.ObjectId;
  ticketType: MaintenanceTicketType;
  status: MaintenanceTicketStatus;
  priority: MaintenanceTicketPriority;
  reportedIssue: string;
  reportedByUserId: string;
  reportedAt: Date;
  scheduledDate?: Date; // set for PREVENTIVE tickets
  assignedVendor?: string;
  assignedTechnician?: string;
  resolvedAt?: Date;
  resolvedByUserId?: string;
  resolutionNotes?: string;
  downtimeMinutes?: number; // computed at resolution: resolvedAt - reportedAt, for BREAKDOWN tickets
  cost?: number;
}

export type MaintenanceTicketDocument = HydratedDocument<MaintenanceTicketAttrs>;

const MaintenanceTicketSchema = new Schema<MaintenanceTicketAttrs>(
  {
    ticketNumber: { type: String, required: true, unique: true, immutable: true },
    assetId: { type: Schema.Types.ObjectId, ref: "Asset", required: true, index: true },
    ticketType: { type: String, required: true, enum: Object.values(MaintenanceTicketType) },
    status: { type: String, required: true, enum: Object.values(MaintenanceTicketStatus), default: MaintenanceTicketStatus.OPEN },
    priority: { type: String, required: true, enum: Object.values(MaintenanceTicketPriority), default: MaintenanceTicketPriority.MEDIUM },
    reportedIssue: { type: String, required: true, trim: true, maxlength: 1000 },
    reportedByUserId: { type: String, required: true },
    reportedAt: { type: Date, required: true, default: () => new Date() },
    scheduledDate: { type: Date },
    assignedVendor: { type: String, trim: true },
    assignedTechnician: { type: String, trim: true },
    resolvedAt: { type: Date },
    resolvedByUserId: { type: String },
    resolutionNotes: { type: String, trim: true, maxlength: 2000 },
    downtimeMinutes: { type: Number, min: 0 },
    cost: { type: Number, min: 0 },
  },
  { timestamps: true, collection: "maintenance_tickets" },
);

MaintenanceTicketSchema.index({ assetId: 1, reportedAt: -1 });
// The biomedical worklist: open/in-progress tickets by priority.
MaintenanceTicketSchema.index({ status: 1, priority: 1 });

export const MaintenanceTicket: Model<MaintenanceTicketAttrs> = model<MaintenanceTicketAttrs>(
  "MaintenanceTicket",
  MaintenanceTicketSchema,
);

import { withTransaction } from "../config/database.js";
import { Asset, type AssetDocument } from "../models/assets/Asset.model.js";
import { MaintenanceTicket, type MaintenanceTicketDocument } from "../models/assets/MaintenanceTicket.model.js";
import {
  AssetCategory,
  AssetStatus,
  AssetCriticality,
  AmcCoverageType,
  MaintenanceTicketType,
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
} from "../types/common.types.js";
import { generateAssetCode, generateMaintenanceTicketNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/errors.js";

const AMC_EXPIRING_SOON_DAYS = 30;
export type AmcStatus = "NONE" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";

/** Derived, not stored — AMC status is always "as of now" relative to `amcEndDate`, so persisting it would just be a value that silently goes stale. */
function computeAmcStatus(asset: Pick<AssetAttrsLike, "amcCoverageType" | "amcEndDate">, at: Date = new Date()): AmcStatus {
  if (asset.amcCoverageType === AmcCoverageType.NONE || !asset.amcEndDate) return "NONE";
  const msRemaining = asset.amcEndDate.getTime() - at.getTime();
  if (msRemaining < 0) return "EXPIRED";
  if (msRemaining <= AMC_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) return "EXPIRING_SOON";
  return "ACTIVE";
}
interface AssetAttrsLike {
  amcCoverageType: AmcCoverageType;
  amcEndDate?: Date;
}

export interface AssetWithAmcStatus {
  asset: AssetDocument;
  amcStatus: AmcStatus;
}

export interface CreateAssetInput {
  name: string;
  category: AssetCategory;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  departmentId: string;
  location: string;
  purchaseDate: string;
  purchasePrice: number;
  warrantyExpiryDate?: string;
  criticality?: AssetCriticality;
  amcVendor?: string;
  amcContractNumber?: string;
  amcCoverageType?: AmcCoverageType;
  amcStartDate?: string;
  amcEndDate?: string;
}

export interface LogBreakdownInput {
  assetId: string;
  reportedIssue: string;
  priority?: MaintenanceTicketPriority;
}

export interface SchedulePmInput {
  assetId: string;
  scheduledDate: string;
  assignedVendor?: string;
  assignedTechnician?: string;
  notes?: string;
}

export interface ResolveTicketInput {
  ticketId: string;
  resolutionNotes: string;
  cost?: number;
}

export interface RenewAmcInput {
  assetId: string;
  amcVendor: string;
  amcContractNumber: string;
  amcCoverageType: AmcCoverageType;
  amcStartDate: string;
  amcEndDate: string;
}

/**
 * Biomedical Asset & AMC Management. Every write that touches both a
 * ticket and its owning asset's `status`/`nextPmDueDate`/`lastServicedAt`
 * runs inside `withTransaction`, so a device can never be left showing
 * `ACTIVE` with an open breakdown ticket against it, or vice versa.
 */
export class AssetService {
  async listAssets(filters: { status?: AssetStatus; category?: AssetCategory } = {}): Promise<AssetWithAmcStatus[]> {
    const query: Record<string, unknown> = { isActive: true };
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    const assets = await Asset.find(query).sort({ name: 1 });
    return assets.map((asset) => ({ asset, amcStatus: computeAmcStatus(asset) }));
  }

  async createAsset(input: CreateAssetInput): Promise<AssetDocument> {
    const assetCode = await generateAssetCode();
    return Asset.create({
      assetCode,
      name: input.name,
      category: input.category,
      manufacturer: input.manufacturer,
      modelNumber: input.modelNumber,
      serialNumber: input.serialNumber,
      departmentId: toObjectId(input.departmentId, "departmentId"),
      location: input.location,
      purchaseDate: new Date(input.purchaseDate),
      purchasePrice: input.purchasePrice,
      warrantyExpiryDate: input.warrantyExpiryDate ? new Date(input.warrantyExpiryDate) : undefined,
      criticality: input.criticality,
      amcVendor: input.amcVendor,
      amcContractNumber: input.amcContractNumber,
      amcCoverageType: input.amcCoverageType,
      amcStartDate: input.amcStartDate ? new Date(input.amcStartDate) : undefined,
      amcEndDate: input.amcEndDate ? new Date(input.amcEndDate) : undefined,
      status: AssetStatus.ACTIVE,
    });
  }

  async listMaintenanceTickets(filters: { status?: MaintenanceTicketStatus } = {}): Promise<MaintenanceTicketDocument[]> {
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    return MaintenanceTicket.find(query).sort({ reportedAt: -1 }).populate("assetId", "assetCode name category location");
  }

  /** Reports a fault: opens a BREAKDOWN ticket and immediately takes the asset out of ACTIVE service. */
  async logBreakdownTicket(
    input: LogBreakdownInput,
    actor: string,
  ): Promise<{ ticket: MaintenanceTicketDocument; asset: AssetDocument }> {
    if (!input.reportedIssue?.trim()) {
      throw new ValidationError("reportedIssue is required");
    }
    const assetId = toObjectId(input.assetId, "assetId");

    return withTransaction(async (session) => {
      const asset = await Asset.findById(assetId).session(session);
      if (!asset) throw new NotFoundError(`Asset ${input.assetId} not found`);
      if (asset.status === AssetStatus.DECOMMISSIONED) {
        throw new ConflictError(`Asset ${asset.assetCode} is decommissioned and cannot receive new tickets`);
      }

      const ticketNumber = await generateMaintenanceTicketNumber();
      const ticket = firstOrThrow(
        await MaintenanceTicket.create(
          [
            {
              ticketNumber,
              assetId: asset._id,
              ticketType: MaintenanceTicketType.BREAKDOWN,
              status: MaintenanceTicketStatus.OPEN,
              priority: input.priority ?? MaintenanceTicketPriority.MEDIUM,
              reportedIssue: input.reportedIssue.trim(),
              reportedByUserId: actor,
              reportedAt: new Date(),
            },
          ],
          { session },
        ),
        "MaintenanceTicket.create returned no document",
      );

      asset.status = AssetStatus.UNDER_MAINTENANCE;
      await asset.save({ session });

      return { ticket, asset };
    });
  }

  /** Books a future Preventive Maintenance visit — opens a PREVENTIVE ticket without taking the asset offline (it stays in service until the visit actually happens). */
  async schedulePreventiveMaintenance(
    input: SchedulePmInput,
    actor: string,
  ): Promise<{ ticket: MaintenanceTicketDocument; asset: AssetDocument }> {
    const scheduledDate = new Date(input.scheduledDate);
    if (Number.isNaN(scheduledDate.getTime())) {
      throw new ValidationError("scheduledDate must be a valid date");
    }
    const assetId = toObjectId(input.assetId, "assetId");

    return withTransaction(async (session) => {
      const asset = await Asset.findById(assetId).session(session);
      if (!asset) throw new NotFoundError(`Asset ${input.assetId} not found`);

      const ticketNumber = await generateMaintenanceTicketNumber();
      const ticket = firstOrThrow(
        await MaintenanceTicket.create(
          [
            {
              ticketNumber,
              assetId: asset._id,
              ticketType: MaintenanceTicketType.PREVENTIVE,
              status: MaintenanceTicketStatus.OPEN,
              priority: MaintenanceTicketPriority.LOW,
              reportedIssue: "Scheduled preventive maintenance" + (input.notes ? `: ${input.notes}` : ""),
              reportedByUserId: actor,
              reportedAt: new Date(),
              scheduledDate,
              assignedVendor: input.assignedVendor,
              assignedTechnician: input.assignedTechnician,
            },
          ],
          { session },
        ),
        "MaintenanceTicket.create returned no document",
      );

      asset.nextPmDueDate = scheduledDate;
      await asset.save({ session });

      return { ticket, asset };
    });
  }

  /**
   * Closes out a ticket. For a BREAKDOWN ticket, the asset only returns
   * to ACTIVE once this was the *last* open breakdown against it — a
   * second concurrent fault must keep the device flagged UNDER_MAINTENANCE
   * even after the first ticket is resolved.
   */
  async resolveMaintenanceTicket(
    input: ResolveTicketInput,
    actor: string,
  ): Promise<{ ticket: MaintenanceTicketDocument; asset: AssetDocument }> {
    if (!input.resolutionNotes?.trim()) {
      throw new ValidationError("resolutionNotes is required");
    }
    const ticketId = toObjectId(input.ticketId, "ticketId");

    return withTransaction(async (session) => {
      const ticket = await MaintenanceTicket.findById(ticketId).session(session);
      if (!ticket) throw new NotFoundError(`Ticket ${input.ticketId} not found`);
      if (ticket.status === MaintenanceTicketStatus.RESOLVED || ticket.status === MaintenanceTicketStatus.CLOSED) {
        throw new ConflictError(`Ticket ${ticket.ticketNumber} is already ${ticket.status}`);
      }

      const asset = await Asset.findById(ticket.assetId).session(session);
      if (!asset) throw new NotFoundError(`Asset for ticket ${ticket.ticketNumber} not found`);

      const now = new Date();
      ticket.status = MaintenanceTicketStatus.RESOLVED;
      ticket.resolvedAt = now;
      ticket.resolvedByUserId = actor;
      ticket.resolutionNotes = input.resolutionNotes.trim();
      ticket.cost = input.cost;
      ticket.downtimeMinutes = Math.max(0, Math.round((now.getTime() - ticket.reportedAt.getTime()) / 60000));
      await ticket.save({ session });

      asset.lastServicedAt = now;
      if (ticket.ticketType === MaintenanceTicketType.BREAKDOWN && asset.status === AssetStatus.UNDER_MAINTENANCE) {
        const otherOpenBreakdowns = await MaintenanceTicket.countDocuments({
          assetId: asset._id,
          ticketType: MaintenanceTicketType.BREAKDOWN,
          status: { $in: [MaintenanceTicketStatus.OPEN, MaintenanceTicketStatus.IN_PROGRESS] },
          _id: { $ne: ticket._id },
        }).session(session);
        if (otherOpenBreakdowns === 0) {
          asset.status = AssetStatus.ACTIVE;
        }
      }
      await asset.save({ session });

      return { ticket, asset };
    });
  }

  /** Records a fresh AMC/CMC contract term — single-document write, no other collection needs to stay in sync with it. */
  async renewAmcContract(input: RenewAmcInput): Promise<AssetDocument> {
    const amcStartDate = new Date(input.amcStartDate);
    const amcEndDate = new Date(input.amcEndDate);
    if (Number.isNaN(amcStartDate.getTime()) || Number.isNaN(amcEndDate.getTime())) {
      throw new ValidationError("amcStartDate/amcEndDate must be valid dates");
    }
    if (amcStartDate >= amcEndDate) {
      throw new ValidationError("amcStartDate must be before amcEndDate");
    }

    const asset = await Asset.findById(toObjectId(input.assetId, "assetId"));
    if (!asset) throw new NotFoundError(`Asset ${input.assetId} not found`);

    asset.amcVendor = input.amcVendor;
    asset.amcContractNumber = input.amcContractNumber;
    asset.amcCoverageType = input.amcCoverageType;
    asset.amcStartDate = amcStartDate;
    asset.amcEndDate = amcEndDate;
    await asset.save();
    return asset;
  }
}

export const assetService = new AssetService();

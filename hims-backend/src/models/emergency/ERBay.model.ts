import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { ERBayType, BedStatus } from "../../types/common.types.js";

/**
 * The ER's own fast-churn resource pool — crash carts, resus bays, and
 * ER-side beds. Deliberately not a `Bed`/`Ward` row: `Bed` is built around
 * IPD's admit -> discharge -> housekeeping (CLEANING) lifecycle, while an
 * ER bay turns over in minutes and has no ward/rate concept at all.
 * Status reuses `BedStatus` (VACANT/OCCUPIED/CLEANING/MAINTENANCE/BLOCKED)
 * since the vocabulary is identical, and claiming one is the same
 * findOneAndUpdate-with-status-filter pattern as `ADTService.admitPatient`.
 */
export interface ERBayAttrs {
  bayNumber: string; // unique, e.g. "ER-BED-04", "ER-CRASH-01"
  bayType: ERBayType;
  status: BedStatus;
  currentErVisitId?: Types.ObjectId;
  hasCardiacMonitor: boolean;
  hasOxygenSupply: boolean;
  isActive: boolean;
}

export type ERBayDocument = HydratedDocument<ERBayAttrs>;

const ERBaySchema = new Schema<ERBayAttrs>(
  {
    bayNumber: { type: String, required: true, unique: true, trim: true },
    bayType: { type: String, required: true, enum: Object.values(ERBayType) },
    status: { type: String, required: true, enum: Object.values(BedStatus), default: BedStatus.VACANT },
    currentErVisitId: { type: Schema.Types.ObjectId, ref: "ERVisit" },
    hasCardiacMonitor: { type: Boolean, required: true, default: true },
    hasOxygenSupply: { type: Boolean, required: true, default: true },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "er_bays", optimisticConcurrency: true },
);

// The triage board's primary query: "which bays are free right now".
ERBaySchema.index({ status: 1, bayType: 1 });

export const ERBay: Model<ERBayAttrs> = model<ERBayAttrs>("ERBay", ERBaySchema);

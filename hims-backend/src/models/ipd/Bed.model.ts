import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { BedStatus, WardCategory } from "../../types/common.types.js";

/**
 * The contended resource in the ADT engine: allocating a bed is a
 * find-and-flip-status operation that MUST run inside the same
 * `withTransaction` call as creating the Admission document, guarded by
 * `{ status: BedStatus.VACANT }` in the filter so two concurrent
 * admissions can never claim the same bed. `optimisticConcurrency` is
 * enabled as defense in depth against non-transactional callers.
 */
export interface BedAttrs {
  wardId: Types.ObjectId;
  bedNumber: string; // unique within ward, e.g. "ICU-A-04"
  category: WardCategory;
  status: BedStatus;
  currentAdmissionId?: Types.ObjectId;
  ratePerDay: number; // fallback/base rate; authoritative pricing comes from TariffMaster
  hasOxygenSupply: boolean;
  hasVentilator: boolean;
  hasCardiacMonitor: boolean;
  lastSanitizedAt?: Date;
  outOfServiceReason?: string;
}

export type BedDocument = HydratedDocument<BedAttrs>;

const BedSchema = new Schema<BedAttrs>(
  {
    wardId: { type: Schema.Types.ObjectId, ref: "Ward", required: true, index: true },
    bedNumber: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: Object.values(WardCategory) },
    status: { type: String, required: true, enum: Object.values(BedStatus), default: BedStatus.VACANT },
    currentAdmissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    ratePerDay: { type: Number, required: true, min: 0 },
    hasOxygenSupply: { type: Boolean, required: true, default: false },
    hasVentilator: { type: Boolean, required: true, default: false },
    hasCardiacMonitor: { type: Boolean, required: true, default: false },
    lastSanitizedAt: { type: Date },
    outOfServiceReason: { type: String, trim: true },
  },
  { timestamps: true, collection: "beds", optimisticConcurrency: true },
);

BedSchema.index({ wardId: 1, bedNumber: 1 }, { unique: true });
// Primary query for the visual bed-management grid: "show me all vacant
// beds in category X" refreshed on every ADT event.
BedSchema.index({ category: 1, status: 1 });

export const Bed: Model<BedAttrs> = model<BedAttrs>("Bed", BedSchema);

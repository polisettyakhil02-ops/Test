import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { BloodGroup, BloodComponentType, CrossMatchStatus } from "../../types/common.types.js";

/**
 * A ward's request for compatibility-tested blood. `crossMatchedBagIds` is
 * populated by `bloodbank.service.ts#performCrossMatch` — the exact bags
 * reserved (AVAILABLE -> RESERVED) against this request once it's marked
 * COMPATIBLE — and is the allowlist `dispenseBloodBag` checks against: a
 * bag can only be issued if it appears here AND this request is
 * COMPATIBLE, which is what "prevents dispensing a bag if the cross-match
 * failed" actually means at the data level.
 */
export interface CrossMatchRequestAttrs {
  requestNumber: string; // e.g. "XM-2026-000318"
  patientId: Types.ObjectId;
  admissionId?: Types.ObjectId;
  bloodGroupRequired: BloodGroup;
  componentType: BloodComponentType;
  unitsRequired: number;
  status: CrossMatchStatus;
  crossMatchedBagIds: Types.ObjectId[];
  requestedByUserId: string;
  requestedAt: Date;
  performedByUserId?: string;
  performedAt?: Date;
  resultNotes?: string;
  urgent: boolean;
}

export type CrossMatchRequestDocument = HydratedDocument<CrossMatchRequestAttrs>;

const CrossMatchRequestSchema = new Schema<CrossMatchRequestAttrs>(
  {
    requestNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    bloodGroupRequired: { type: String, required: true, enum: Object.values(BloodGroup) },
    componentType: { type: String, required: true, enum: Object.values(BloodComponentType) },
    unitsRequired: { type: Number, required: true, min: 1, max: 20 },
    status: { type: String, required: true, enum: Object.values(CrossMatchStatus), default: CrossMatchStatus.PENDING },
    crossMatchedBagIds: { type: [Schema.Types.ObjectId], ref: "BloodBag", default: [] },
    requestedByUserId: { type: String, required: true },
    requestedAt: { type: Date, required: true, default: () => new Date() },
    performedByUserId: { type: String },
    performedAt: { type: Date },
    resultNotes: { type: String, trim: true, maxlength: 1000 },
    urgent: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: "cross_match_requests" },
);

CrossMatchRequestSchema.index({ status: 1, urgent: 1, requestedAt: 1 });
CrossMatchRequestSchema.index({ patientId: 1, requestedAt: -1 });

export const CrossMatchRequest: Model<CrossMatchRequestAttrs> = model<CrossMatchRequestAttrs>(
  "CrossMatchRequest",
  CrossMatchRequestSchema,
);

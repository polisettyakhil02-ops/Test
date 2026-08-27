import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";

export enum TokenStatus {
  WAITING = "WAITING",
  CALLED = "CALLED",
  IN_CONSULTATION = "IN_CONSULTATION",
  COMPLETED = "COMPLETED",
  NO_SHOW = "NO_SHOW",
  CANCELLED = "CANCELLED",
}

/**
 * One document per issued token. `tokenNumber` is assigned from the Redis
 * atomic counter at `REDIS_KEYS.opdQueueToken(doctorId, dateISO)` at issue
 * time (see pharmacy/billing services for the same counter pattern) so
 * concurrent reception desks never collide on the same number; this
 * document is the durable, queryable record of that assignment for the
 * token-display screens and daily reconciliation.
 */
export interface OPDQueueAttrs {
  doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  visitDate: Date; // date-only, normalized to local midnight UTC
  tokenNumber: number;
  status: TokenStatus;
  isFollowUp: boolean;
  checkedInAt: Date;
  calledAt?: Date;
  consultationStartedAt?: Date;
  consultationEndedAt?: Date;
  roomNumber?: string;
  priority: "NORMAL" | "SENIOR_CITIZEN" | "EMERGENCY" | "VIP";
  createdBy: string;
}

export type OPDQueueDocument = HydratedDocument<OPDQueueAttrs>;

const OPDQueueSchema = new Schema<OPDQueueAttrs>(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    visitDate: { type: Date, required: true },
    tokenNumber: { type: Number, required: true, min: 1 },
    status: { type: String, required: true, enum: Object.values(TokenStatus), default: TokenStatus.WAITING },
    isFollowUp: { type: Boolean, required: true, default: false },
    checkedInAt: { type: Date, required: true, default: () => new Date() },
    calledAt: { type: Date },
    consultationStartedAt: { type: Date },
    consultationEndedAt: { type: Date },
    roomNumber: { type: String, trim: true },
    priority: {
      type: String,
      required: true,
      enum: ["NORMAL", "SENIOR_CITIZEN", "EMERGENCY", "VIP"],
      default: "NORMAL",
    },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "opd_queue_tokens" },
);

// One token number per doctor per day — guards against a Redis counter
// desync ever producing a silent duplicate.
OPDQueueSchema.index({ doctorId: 1, visitDate: 1, tokenNumber: 1 }, { unique: true });
// Fast "today's live queue for doctor X" read for the token-display board.
OPDQueueSchema.index({ doctorId: 1, visitDate: 1, status: 1 });

export const OPDQueue: Model<OPDQueueAttrs> = model<OPDQueueAttrs>("OPDQueue", OPDQueueSchema);

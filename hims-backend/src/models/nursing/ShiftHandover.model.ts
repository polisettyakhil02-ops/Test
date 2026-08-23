import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";

export interface PatientHandoverNote {
  admissionId: Types.ObjectId;
  bedId: Types.ObjectId;
  situation: string;
  background: string;
  assessment: string;
  recommendation: string; // SBAR format
  priorityFlags: ("FALL_RISK" | "NPO" | "ISOLATION" | "DNR" | "CRITICAL")[];
}

export interface ShiftHandoverAttrs {
  wardId: Types.ObjectId;
  shift: "MORNING" | "EVENING" | "NIGHT";
  shiftDate: Date;
  outgoingNurseUserId: string;
  incomingNurseUserId?: string;
  patientNotes: PatientHandoverNote[];
  generalWardNotes?: string;
  isAcknowledged: boolean;
  acknowledgedAt?: Date;
}

export type ShiftHandoverDocument = HydratedDocument<ShiftHandoverAttrs>;

const PatientHandoverNoteSchema = new Schema<PatientHandoverNote>(
  {
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: true },
    bedId: { type: Schema.Types.ObjectId, ref: "Bed", required: true },
    situation: { type: String, required: true },
    background: { type: String, required: true },
    assessment: { type: String, required: true },
    recommendation: { type: String, required: true },
    priorityFlags: {
      type: [String],
      enum: ["FALL_RISK", "NPO", "ISOLATION", "DNR", "CRITICAL"],
      default: [],
    },
  },
  { _id: false },
);

const ShiftHandoverSchema = new Schema<ShiftHandoverAttrs>(
  {
    wardId: { type: Schema.Types.ObjectId, ref: "Ward", required: true, index: true },
    shift: { type: String, required: true, enum: ["MORNING", "EVENING", "NIGHT"] },
    shiftDate: { type: Date, required: true },
    outgoingNurseUserId: { type: String, required: true },
    incomingNurseUserId: { type: String },
    patientNotes: { type: [PatientHandoverNoteSchema], default: [] },
    generalWardNotes: { type: String, trim: true, maxlength: 2000 },
    isAcknowledged: { type: Boolean, required: true, default: false },
    acknowledgedAt: { type: Date },
  },
  { timestamps: true, collection: "shift_handovers" },
);

ShiftHandoverSchema.index({ wardId: 1, shiftDate: -1, shift: 1 }, { unique: true });

export const ShiftHandover: Model<ShiftHandoverAttrs> = model<ShiftHandoverAttrs>(
  "ShiftHandover",
  ShiftHandoverSchema,
);

import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { DialysisShift, DmoCriticalityLevel, DmoHandoverStatus } from "../../types/common.types.js";

/**
 * The Duty Medical Officer's shift-handover note: a doctor-authored,
 * per-patient flag raised during an off-hours shift so the morning team
 * inherits it explicitly rather than having to re-discover it on rounds.
 * Deliberately a separate model from `nursing/ShiftHandover.model.ts`
 * rather than an extension of it: `ShiftHandover` is one document per
 * ward per shift, filed by the outgoing *nurse* at shift end and scoped to
 * that ward's beds; a DMO note is authored by the covering *doctor*,
 * raised ad hoc for one patient the moment a concern appears (not batched
 * per ward), and is explicitly acknowledged by name rather than by a
 * ward-level boolean. `shift` reuses `DialysisShift` — see that enum's
 * doc comment — since both are just the same time-of-day shift
 * vocabulary, not a dialysis-specific concept.
 */
export interface DmoHandoverNoteAttrs {
  noteNumber: string; // e.g. "DMO-2026-000045"
  patientId: Types.ObjectId;
  admissionId?: Types.ObjectId;
  dutyDoctorId: Types.ObjectId; // ref -> Doctor, the outgoing DMO who wrote the note
  shift: DialysisShift;
  shiftDate: Date;
  criticalityLevel: DmoCriticalityLevel;
  situation: string;
  background: string;
  assessment: string;
  recommendation: string; // SBAR format
  actionItems: string[];
  status: DmoHandoverStatus;
  acknowledgedByUserId?: string;
  acknowledgedAt?: Date;
  createdBy: string;
}

export type DmoHandoverNoteDocument = HydratedDocument<DmoHandoverNoteAttrs>;

const DmoHandoverNoteSchema = new Schema<DmoHandoverNoteAttrs>(
  {
    noteNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    dutyDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    shift: { type: String, required: true, enum: Object.values(DialysisShift) },
    shiftDate: { type: Date, required: true },
    criticalityLevel: { type: String, required: true, enum: Object.values(DmoCriticalityLevel) },
    situation: { type: String, required: true, trim: true },
    background: { type: String, required: true, trim: true },
    assessment: { type: String, required: true, trim: true },
    recommendation: { type: String, required: true, trim: true },
    actionItems: { type: [String], default: [] },
    status: {
      type: String,
      required: true,
      enum: Object.values(DmoHandoverStatus),
      default: DmoHandoverStatus.PENDING_ACKNOWLEDGEMENT,
    },
    acknowledgedByUserId: { type: String },
    acknowledgedAt: { type: Date },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "dmo_handover_notes" },
);

// The morning board's dominant query: unacknowledged notes, most critical first.
DmoHandoverNoteSchema.index({ status: 1, criticalityLevel: 1, shiftDate: -1 });
DmoHandoverNoteSchema.index({ patientId: 1, shiftDate: -1 });

export const DmoHandoverNote: Model<DmoHandoverNoteAttrs> = model<DmoHandoverNoteAttrs>(
  "DmoHandoverNote",
  DmoHandoverNoteSchema,
);

import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { RadiologyReportStatus } from "../../types/common.types.js";

/**
 * The radiologist's typed transcription for one `RadiologyOrder` —
 * `findings`/`impression` is the standard radiology report split (the
 * itemized observations vs. the summary conclusion a referring doctor
 * actually reads first). Kept as its own collection, not embedded on
 * `RadiologyOrder`, the same reasoning `LabResult` is split from
 * `LabOrder`: a draft-vs-finalized state machine independent of the
 * order's own scan-completion status.
 */
export interface RadiologyReportAttrs {
  radiologyOrderId: Types.ObjectId;
  patientId: Types.ObjectId;
  radiologistId: Types.ObjectId;
  /** Both may be empty while `status` is `DRAFT` — the split-screen editor autosaves as the radiologist types. `finalizeReport` (radiology.service.ts) is what actually requires non-empty text, not the schema. */
  findings: string;
  impression: string;
  isCriticalFinding: boolean;
  criticalFindingNotifiedTo?: string;
  criticalFindingNotifiedAt?: Date;
  status: RadiologyReportStatus;
  dictatedAt: Date;
  finalizedAt?: Date;
  finalizedByUserId?: string;
}

export type RadiologyReportDocument = HydratedDocument<RadiologyReportAttrs>;

const RadiologyReportSchema = new Schema<RadiologyReportAttrs>(
  {
    radiologyOrderId: { type: Schema.Types.ObjectId, ref: "RadiologyOrder", required: true, unique: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    radiologistId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    findings: { type: String, required: true, trim: true, maxlength: 5000, default: "" },
    impression: { type: String, required: true, trim: true, maxlength: 2000, default: "" },
    isCriticalFinding: { type: Boolean, required: true, default: false },
    criticalFindingNotifiedTo: { type: String, trim: true },
    criticalFindingNotifiedAt: { type: Date },
    status: { type: String, required: true, enum: Object.values(RadiologyReportStatus), default: RadiologyReportStatus.DRAFT },
    dictatedAt: { type: Date, required: true, default: () => new Date() },
    finalizedAt: { type: Date },
    finalizedByUserId: { type: String },
  },
  { timestamps: true, collection: "radiology_reports" },
);

RadiologyReportSchema.index({ patientId: 1, dictatedAt: -1 });

export const RadiologyReport: Model<RadiologyReportAttrs> = model<RadiologyReportAttrs>(
  "RadiologyReport",
  RadiologyReportSchema,
);

import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { ResultFlag } from "../../types/common.types.js";

export interface ResultParameter {
  parameterName: string;
  value: string; // stored as string to accommodate qualitative results ("Positive"/"Reactive")
  numericValue?: number; // populated when value is numeric, for range comparisons/trending
  unit?: string;
  referenceRangeText: string; // human-readable snapshot, e.g. "13.0 - 17.0 g/dL"
  flag: ResultFlag;
}

/**
 * The printable, reportable result set for one LabOrderTestLine. Kept
 * separate from LabOrder itself so verification/amendment workflow
 * (technician enters -> pathologist verifies -> report released) has a
 * clean state machine independent of order-level status.
 */
export interface LabResultAttrs {
  labOrderId: Types.ObjectId;
  labOrderTestLineId: Types.ObjectId;
  patientId: Types.ObjectId;
  specimenId: Types.ObjectId;
  labTestId: Types.ObjectId;
  parameters: ResultParameter[];
  overallFlag: ResultFlag;
  interpretiveComment?: string;
  performedByUserId: string;
  performedAt: Date;
  verifiedByUserId?: string;
  verifiedAt?: Date;
  isCriticalValueNotified: boolean;
  criticalValueNotifiedTo?: string;
  criticalValueNotifiedAt?: Date;
  isAmended: boolean;
  amendmentReason?: string;
  reportPdfStorageKey?: string;
}

export type LabResultDocument = HydratedDocument<LabResultAttrs>;

const ResultParameterSchema = new Schema<ResultParameter>(
  {
    parameterName: { type: String, required: true },
    value: { type: String, required: true },
    numericValue: { type: Number },
    unit: { type: String },
    referenceRangeText: { type: String, required: true },
    flag: { type: String, required: true, enum: Object.values(ResultFlag) },
  },
  { _id: false },
);

const LabResultSchema = new Schema<LabResultAttrs>(
  {
    labOrderId: { type: Schema.Types.ObjectId, ref: "LabOrder", required: true, index: true },
    labOrderTestLineId: { type: Schema.Types.ObjectId, required: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    specimenId: { type: Schema.Types.ObjectId, ref: "Specimen", required: true },
    labTestId: { type: Schema.Types.ObjectId, ref: "LabTest", required: true },
    parameters: {
      type: [ResultParameterSchema],
      validate: { validator: (v: ResultParameter[]) => v.length > 0, message: "At least one parameter is required" },
    },
    overallFlag: { type: String, required: true, enum: Object.values(ResultFlag), default: ResultFlag.NORMAL },
    interpretiveComment: { type: String, trim: true, maxlength: 2000 },
    performedByUserId: { type: String, required: true },
    performedAt: { type: Date, required: true, default: () => new Date() },
    verifiedByUserId: { type: String },
    verifiedAt: { type: Date },
    isCriticalValueNotified: { type: Boolean, required: true, default: false },
    criticalValueNotifiedTo: { type: String },
    criticalValueNotifiedAt: { type: Date },
    isAmended: { type: Boolean, required: true, default: false },
    amendmentReason: { type: String, trim: true, maxlength: 500 },
    reportPdfStorageKey: { type: String },
  },
  { timestamps: true, collection: "lab_results" },
);

LabResultSchema.pre("validate", function preValidate(next) {
  const hasCriticalFlag = this.parameters.some(
    (p) => p.flag === ResultFlag.CRITICAL_LOW || p.flag === ResultFlag.CRITICAL_HIGH,
  );
  if (hasCriticalFlag && !this.isCriticalValueNotified && this.verifiedAt) {
    next(new Error("Critical value must be notified before a verified result can be saved"));
    return;
  }
  next();
});

LabResultSchema.index({ patientId: 1, performedAt: -1 });

export const LabResult: Model<LabResultAttrs> = model<LabResultAttrs>("LabResult", LabResultSchema);

import { Schema, model, type Model, type HydratedDocument } from "mongoose";

export interface SterilizedInstrumentSet {
  setName: string; // e.g. "General Surgery Tray A"
  setBarcodeValue: string;
  cycleResult: "PASS" | "FAIL";
}

/** One autoclave/sterilization cycle. Instrument sets are only eligible for OT use once linked to a PASS-result cycle. */
export interface SterilizationLogAttrs {
  cycleNumber: string;
  autoclaveId: string;
  cycleType: "STEAM" | "ETO" | "PLASMA" | "DRY_HEAT";
  instrumentSets: SterilizedInstrumentSet[];
  temperatureCelsius: number;
  pressureKPa?: number;
  durationMinutes: number;
  biologicalIndicatorResult: "PASS" | "FAIL" | "PENDING";
  chemicalIndicatorResult: "PASS" | "FAIL";
  startedAt: Date;
  completedAt?: Date;
  operatedByUserId: string;
  verifiedByUserId?: string;
  notes?: string;
}

export type SterilizationLogDocument = HydratedDocument<SterilizationLogAttrs>;

const SterilizedInstrumentSetSchema = new Schema<SterilizedInstrumentSet>(
  {
    setName: { type: String, required: true, trim: true },
    setBarcodeValue: { type: String, required: true },
    cycleResult: { type: String, required: true, enum: ["PASS", "FAIL"] },
  },
  { _id: false },
);

const SterilizationLogSchema = new Schema<SterilizationLogAttrs>(
  {
    cycleNumber: { type: String, required: true, unique: true, immutable: true },
    autoclaveId: { type: String, required: true },
    cycleType: { type: String, required: true, enum: ["STEAM", "ETO", "PLASMA", "DRY_HEAT"] },
    instrumentSets: {
      type: [SterilizedInstrumentSetSchema],
      validate: { validator: (v: SterilizedInstrumentSet[]) => v.length > 0, message: "At least one instrument set is required" },
    },
    temperatureCelsius: { type: Number, required: true },
    pressureKPa: { type: Number },
    durationMinutes: { type: Number, required: true, min: 1 },
    biologicalIndicatorResult: { type: String, required: true, enum: ["PASS", "FAIL", "PENDING"], default: "PENDING" },
    chemicalIndicatorResult: { type: String, required: true, enum: ["PASS", "FAIL"] },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
    operatedByUserId: { type: String, required: true },
    verifiedByUserId: { type: String },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true, collection: "sterilization_logs" },
);

SterilizationLogSchema.index({ "instrumentSets.setBarcodeValue": 1 });
SterilizationLogSchema.index({ startedAt: -1 });

export const SterilizationLog: Model<SterilizationLogAttrs> = model<SterilizationLogAttrs>(
  "SterilizationLog",
  SterilizationLogSchema,
);

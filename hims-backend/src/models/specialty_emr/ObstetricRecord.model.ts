import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { Gender, ObstetricRecordStatus, DeliveryMode, FetalPresentation, LiquorColor } from "../../types/common.types.js";

export interface AncVisit {
  visitDate: Date;
  gestationWeeks: number;
  weightKg: number;
  bloodPressureSystolic: number;
  bloodPressureDiastolic: number;
  fundalHeightCm?: number;
  fetalHeartRatePerMin?: number;
  fetalPresentation?: FetalPresentation;
  urineAlbumin?: "NIL" | "TRACE" | "1+" | "2+" | "3+";
  pedalEdema: boolean;
  notes?: string;
  recordedByUserId: string;
}

/**
 * One row of the digital Partograph — the WHO-format labor-progress chart
 * plotted against time once active labor begins. `cervicalDilationCm` is
 * the value the frontend plots against the classic alert/action lines; the
 * remaining vitals ride along on the same timestamp the way a paper
 * partograph co-plots them in adjoining rows.
 */
export interface PartographReading {
  recordedAt: Date;
  cervicalDilationCm: number; // 0-10
  fetalHeartRatePerMin: number;
  contractionsPer10Min: number;
  descentOfHeadStation: number; // station, -3 (high) .. +3 (crowning)
  liquorColor: LiquorColor;
  moulding: 0 | 1 | 2 | 3;
  maternalPulsePerMin: number;
  maternalSystolicBP: number;
  maternalDiastolicBP: number;
  maternalTemperatureCelsius?: number;
  oxytocinUnitsPerMin?: number;
  recordedByUserId: string;
}

export interface DeliveryDetails {
  deliveryDate: Date;
  deliveryMode: DeliveryMode;
  babyWeightGrams: number;
  apgarScore1Min: number;
  apgarScore5Min: number;
  babySex: Gender;
  isLiveBirth: boolean;
  complications?: string;
  conductedByDoctorId: Types.ObjectId;
}

/**
 * One pregnancy's obstetric episode: ANC visits from booking through the
 * digital partograph and delivery outcome, all on one document so the
 * labor-progress chart (a strict time series) never has to be reassembled
 * from separate collections at render time.
 */
export interface ObstetricRecordAttrs {
  recordNumber: string; // e.g. "OBS-2026-000012"
  patientId: Types.ObjectId;
  obstetricianId: Types.ObjectId; // ref -> Doctor
  admissionId?: Types.ObjectId; // set once the patient is admitted for delivery
  lmpDate: Date; // last menstrual period
  eddDate: Date; // estimated date of delivery
  gravida: number;
  para: number;
  abortions: number;
  livingChildren: number;
  status: ObstetricRecordStatus;
  ancVisits: AncVisit[];
  partographReadings: PartographReading[];
  laborOnsetAt?: Date;
  deliveryDetails?: DeliveryDetails;
  createdBy: string;
}

export type ObstetricRecordDocument = HydratedDocument<ObstetricRecordAttrs>;

const AncVisitSchema = new Schema<AncVisit>(
  {
    visitDate: { type: Date, required: true },
    gestationWeeks: { type: Number, required: true, min: 4, max: 44 },
    weightKg: { type: Number, required: true, min: 0, max: 300 },
    bloodPressureSystolic: { type: Number, required: true, min: 0, max: 300 },
    bloodPressureDiastolic: { type: Number, required: true, min: 0, max: 200 },
    fundalHeightCm: { type: Number, min: 0 },
    fetalHeartRatePerMin: { type: Number, min: 0, max: 250 },
    fetalPresentation: { type: String, enum: Object.values(FetalPresentation) },
    urineAlbumin: { type: String, enum: ["NIL", "TRACE", "1+", "2+", "3+"] },
    pedalEdema: { type: Boolean, required: true, default: false },
    notes: { type: String, trim: true, maxlength: 1000 },
    recordedByUserId: { type: String, required: true },
  },
  { _id: false },
);

const PartographReadingSchema = new Schema<PartographReading>(
  {
    recordedAt: { type: Date, required: true },
    cervicalDilationCm: { type: Number, required: true, min: 0, max: 10 },
    fetalHeartRatePerMin: { type: Number, required: true, min: 0, max: 250 },
    contractionsPer10Min: { type: Number, required: true, min: 0, max: 10 },
    descentOfHeadStation: { type: Number, required: true, min: -3, max: 3 },
    liquorColor: { type: String, required: true, enum: Object.values(LiquorColor) },
    moulding: { type: Number, required: true, min: 0, max: 3 },
    maternalPulsePerMin: { type: Number, required: true, min: 0, max: 250 },
    maternalSystolicBP: { type: Number, required: true, min: 0, max: 300 },
    maternalDiastolicBP: { type: Number, required: true, min: 0, max: 200 },
    maternalTemperatureCelsius: { type: Number, min: 30, max: 45 },
    oxytocinUnitsPerMin: { type: Number, min: 0 },
    recordedByUserId: { type: String, required: true },
  },
  { _id: false },
);

const DeliveryDetailsSchema = new Schema<DeliveryDetails>(
  {
    deliveryDate: { type: Date, required: true },
    deliveryMode: { type: String, required: true, enum: Object.values(DeliveryMode) },
    babyWeightGrams: { type: Number, required: true, min: 0 },
    apgarScore1Min: { type: Number, required: true, min: 0, max: 10 },
    apgarScore5Min: { type: Number, required: true, min: 0, max: 10 },
    babySex: { type: String, required: true, enum: Object.values(Gender) },
    isLiveBirth: { type: Boolean, required: true },
    complications: { type: String, trim: true, maxlength: 1000 },
    conductedByDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
  },
  { _id: false },
);

const ObstetricRecordSchema = new Schema<ObstetricRecordAttrs>(
  {
    recordNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    obstetricianId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    lmpDate: { type: Date, required: true },
    eddDate: { type: Date, required: true },
    gravida: { type: Number, required: true, min: 1 },
    para: { type: Number, required: true, min: 0 },
    abortions: { type: Number, required: true, min: 0, default: 0 },
    livingChildren: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, required: true, enum: Object.values(ObstetricRecordStatus), default: ObstetricRecordStatus.ANTENATAL },
    ancVisits: { type: [AncVisitSchema], default: [] },
    partographReadings: { type: [PartographReadingSchema], default: [] },
    laborOnsetAt: { type: Date },
    deliveryDetails: { type: DeliveryDetailsSchema },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "obstetric_records" },
);

ObstetricRecordSchema.index({ patientId: 1, lmpDate: -1 });
ObstetricRecordSchema.index({ status: 1 });

export const ObstetricRecord: Model<ObstetricRecordAttrs> = model<ObstetricRecordAttrs>(
  "ObstetricRecord",
  ObstetricRecordSchema,
);

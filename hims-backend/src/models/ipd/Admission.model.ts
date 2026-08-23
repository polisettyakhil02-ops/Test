import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { AdmissionStatus, AdmissionType } from "../../types/common.types.js";

/** One row per ward/bed movement — admission, every transfer, and the final discharge — forming the ADT audit trail for this stay. */
export interface BedMovementRecord {
  wardId: Types.ObjectId;
  bedId: Types.ObjectId;
  movementType: "ADMIT" | "TRANSFER" | "DISCHARGE";
  fromBedId?: Types.ObjectId;
  reason?: string;
  effectiveAt: Date;
  performedByUserId: string;
}

export interface AdmissionAttrs {
  admissionNumber: string; // human-readable, e.g. "IPD-2026-004521"
  patientId: Types.ObjectId;
  admittingDoctorId: Types.ObjectId;
  attendingDoctorId: Types.ObjectId;
  admissionType: AdmissionType;
  status: AdmissionStatus;
  currentWardId: Types.ObjectId;
  currentBedId: Types.ObjectId;
  admissionDate: Date;
  expectedDischargeDate?: Date;
  actualDischargeDate?: Date;
  provisionalDiagnosis: string;
  finalDiagnosis?: string;
  bedMovementHistory: BedMovementRecord[];
  referredFromOPDVisitId?: Types.ObjectId;
  insurancePreAuthId?: Types.ObjectId; // ref -> billing/PreAuthorization
  dischargeSummaryId?: Types.ObjectId;
  guardianConsentObtained: boolean;
  createdBy: string;
}

export type AdmissionDocument = HydratedDocument<AdmissionAttrs>;

const BedMovementRecordSchema = new Schema<BedMovementRecord>(
  {
    wardId: { type: Schema.Types.ObjectId, ref: "Ward", required: true },
    bedId: { type: Schema.Types.ObjectId, ref: "Bed", required: true },
    movementType: { type: String, required: true, enum: ["ADMIT", "TRANSFER", "DISCHARGE"] },
    fromBedId: { type: Schema.Types.ObjectId, ref: "Bed" },
    reason: { type: String, trim: true, maxlength: 500 },
    effectiveAt: { type: Date, required: true, default: () => new Date() },
    performedByUserId: { type: String, required: true },
  },
  { _id: false },
);

const AdmissionSchema = new Schema<AdmissionAttrs>(
  {
    admissionNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    admittingDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    attendingDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    admissionType: { type: String, required: true, enum: Object.values(AdmissionType) },
    status: { type: String, required: true, enum: Object.values(AdmissionStatus), default: AdmissionStatus.ADMITTED },
    currentWardId: { type: Schema.Types.ObjectId, ref: "Ward", required: true },
    currentBedId: { type: Schema.Types.ObjectId, ref: "Bed", required: true },
    admissionDate: { type: Date, required: true, default: () => new Date() },
    expectedDischargeDate: { type: Date },
    actualDischargeDate: { type: Date },
    provisionalDiagnosis: { type: String, required: true, trim: true, maxlength: 1000 },
    finalDiagnosis: { type: String, trim: true, maxlength: 1000 },
    bedMovementHistory: { type: [BedMovementRecordSchema], default: [] },
    referredFromOPDVisitId: { type: Schema.Types.ObjectId, ref: "OPDVisit" },
    insurancePreAuthId: { type: Schema.Types.ObjectId, ref: "PreAuthorization" },
    dischargeSummaryId: { type: Schema.Types.ObjectId, ref: "DischargeSummary" },
    guardianConsentObtained: { type: Boolean, required: true, default: false },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "admissions" },
);

AdmissionSchema.index({ patientId: 1, admissionDate: -1 });
AdmissionSchema.index({ status: 1, currentWardId: 1 });
AdmissionSchema.index({ attendingDoctorId: 1, status: 1 });

export const Admission: Model<AdmissionAttrs> = model<AdmissionAttrs>("Admission", AdmissionSchema);

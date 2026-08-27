import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { TriagePriority, ERVisitStatus, ERArrivalMode } from "../../types/common.types.js";

/**
 * One row per emergency-department encounter, from walk-in/ambulance
 * arrival through to its disposition — discharged, LAMA, deceased,
 * transferred out, or converted into a full IPD `Admission` (see
 * `emergency.service.ts#convertToIpdAdmission`, which sets
 * `dispositionAdmissionId` and is the only writer of it). The medico-legal
 * fields are flags on this document rather than a separate MLC collection:
 * an MLC is a property of the visit, not an independent record with its
 * own lifecycle.
 */
export interface ERVisitAttrs {
  erVisitNumber: string; // e.g. "ER-2026-004521"
  patientId: Types.ObjectId;
  chiefComplaint: string;
  arrivalMode: ERArrivalMode;
  arrivedAt: Date;
  triagePriority: TriagePriority;
  triageNotes?: string;
  triagedAt?: Date;
  triagedByUserId?: string;
  isMedicoLegalCase: boolean;
  mlcNumber?: string; // police FIR/case number, once informed
  policeStationName?: string;
  mlcRemarks?: string;
  erBayId?: Types.ObjectId;
  treatingDoctorId?: Types.ObjectId;
  status: ERVisitStatus;
  dispositionAdmissionId?: Types.ObjectId; // set only by convertToIpdAdmission
  dispositionNotes?: string;
  dischargedAt?: Date;
  dischargedByUserId?: string;
  createdBy: string;
}

export type ERVisitDocument = HydratedDocument<ERVisitAttrs>;

const ERVisitSchema = new Schema<ERVisitAttrs>(
  {
    erVisitNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    chiefComplaint: { type: String, required: true, trim: true, maxlength: 500 },
    arrivalMode: { type: String, required: true, enum: Object.values(ERArrivalMode) },
    arrivedAt: { type: Date, required: true, default: () => new Date() },
    triagePriority: { type: String, required: true, enum: Object.values(TriagePriority) },
    triageNotes: { type: String, trim: true, maxlength: 1000 },
    triagedAt: { type: Date },
    triagedByUserId: { type: String },
    isMedicoLegalCase: { type: Boolean, required: true, default: false },
    mlcNumber: { type: String, trim: true, maxlength: 100 },
    policeStationName: { type: String, trim: true, maxlength: 150 },
    mlcRemarks: { type: String, trim: true, maxlength: 1000 },
    erBayId: { type: Schema.Types.ObjectId, ref: "ERBay" },
    treatingDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor" },
    status: { type: String, required: true, enum: Object.values(ERVisitStatus), default: ERVisitStatus.WAITING },
    dispositionAdmissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    dispositionNotes: { type: String, trim: true, maxlength: 1000 },
    dischargedAt: { type: Date },
    dischargedByUserId: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "er_visits" },
);

// The triage board's core query: active visits ordered by acuity, then arrival time.
ERVisitSchema.index({ status: 1, triagePriority: 1, arrivedAt: 1 });
ERVisitSchema.index({ patientId: 1, arrivedAt: -1 });
ERVisitSchema.index({ isMedicoLegalCase: 1 }, { sparse: true });

export const ERVisit: Model<ERVisitAttrs> = model<ERVisitAttrs>("ERVisit", ERVisitSchema);

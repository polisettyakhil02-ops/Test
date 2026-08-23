import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { SurgeryStatus } from "../../types/common.types.js";

export interface OTTeamMember {
  userId: string;
  role: "SURGEON" | "ASSISTANT_SURGEON" | "ANESTHETIST" | "SCRUB_NURSE" | "CIRCULATING_NURSE" | "TECHNICIAN";
  name: string; // denormalized snapshot
}

export interface PostOpNote {
  recordedAt: Date;
  recordedByUserId: string;
  vitalsStable: boolean;
  complications?: string;
  painManagementPlan?: string;
  recoveryRoomDischargeAt?: Date;
  note: string;
}

/** Covers both general OT and Cath Lab procedures — `theatreType` distinguishes them for scheduling/reporting. */
export interface OTScheduleAttrs {
  surgeryNumber: string;
  patientId: Types.ObjectId;
  admissionId?: Types.ObjectId; // set for inpatient surgery; absent for daycare procedures booked directly
  theatreType: "OT" | "CATH_LAB";
  theatreRoom: string;
  procedureName: string;
  icd10ProcedureCodes: string[];
  team: OTTeamMember[];
  status: SurgeryStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart?: Date;
  actualEnd?: Date;
  anesthesiaType?: "GENERAL" | "REGIONAL" | "LOCAL" | "SEDATION" | "NONE";
  preOpChecklistCompleted: boolean;
  consentObtained: boolean;
  sterilizationLogId?: Types.ObjectId;
  postOpNotes: PostOpNote[];
  invoiceId?: Types.ObjectId;
  createdBy: string;
}

export type OTScheduleDocument = HydratedDocument<OTScheduleAttrs>;

const OTTeamMemberSchema = new Schema<OTTeamMember>(
  {
    userId: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ["SURGEON", "ASSISTANT_SURGEON", "ANESTHETIST", "SCRUB_NURSE", "CIRCULATING_NURSE", "TECHNICIAN"],
    },
    name: { type: String, required: true },
  },
  { _id: false },
);

const PostOpNoteSchema = new Schema<PostOpNote>(
  {
    recordedAt: { type: Date, required: true, default: () => new Date() },
    recordedByUserId: { type: String, required: true },
    vitalsStable: { type: Boolean, required: true },
    complications: { type: String, trim: true, maxlength: 1000 },
    painManagementPlan: { type: String, trim: true, maxlength: 500 },
    recoveryRoomDischargeAt: { type: Date },
    note: { type: String, required: true, maxlength: 2000 },
  },
  { _id: false },
);

const OTScheduleSchema = new Schema<OTScheduleAttrs>(
  {
    surgeryNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    theatreType: { type: String, required: true, enum: ["OT", "CATH_LAB"] },
    theatreRoom: { type: String, required: true, trim: true },
    procedureName: { type: String, required: true, trim: true },
    icd10ProcedureCodes: { type: [String], default: [] },
    team: {
      type: [OTTeamMemberSchema],
      validate: {
        validator: (v: OTTeamMember[]) => v.some((m) => m.role === "SURGEON"),
        message: "At least one SURGEON must be assigned",
      },
    },
    status: { type: String, required: true, enum: Object.values(SurgeryStatus), default: SurgeryStatus.SCHEDULED },
    scheduledStart: { type: Date, required: true },
    scheduledEnd: { type: Date, required: true },
    actualStart: { type: Date },
    actualEnd: { type: Date },
    anesthesiaType: { type: String, enum: ["GENERAL", "REGIONAL", "LOCAL", "SEDATION", "NONE"] },
    preOpChecklistCompleted: { type: Boolean, required: true, default: false },
    consentObtained: { type: Boolean, required: true, default: false },
    sterilizationLogId: { type: Schema.Types.ObjectId, ref: "SterilizationLog" },
    postOpNotes: { type: [PostOpNoteSchema], default: [] },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "ot_schedules" },
);

OTScheduleSchema.pre("validate", function preValidate(next) {
  if (this.scheduledStart >= this.scheduledEnd) {
    next(new Error("scheduledStart must be before scheduledEnd"));
    return;
  }
  next();
});

// Theatre-room double-booking check + the day's OT board.
OTScheduleSchema.index({ theatreRoom: 1, scheduledStart: 1 });
OTScheduleSchema.index({ status: 1, scheduledStart: 1 });
OTScheduleSchema.index({ patientId: 1, scheduledStart: -1 });

export const OTSchedule: Model<OTScheduleAttrs> = model<OTScheduleAttrs>("OTSchedule", OTScheduleSchema);

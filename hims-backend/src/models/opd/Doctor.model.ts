import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { PHONE_REGEX, EMAIL_REGEX, DoctorEmploymentType } from "../../types/common.types.js";

export interface DoctorAttrs {
  userId: Types.ObjectId; // ref -> User (login identity lives in admin/User.model.ts)
  employeeCode: string;
  fullName: string;
  qualifications: string[];
  specializations: string[];
  registrationCouncil: string; // e.g. "Medical Council of India"
  registrationNumber: string;
  departmentId: Types.ObjectId; // ref -> Department
  phone: string;
  email: string;
  consultationFee: number;
  followUpFee?: number;
  averageConsultationMinutes: number; // used to derive slot capacity
  signatureStorageKey?: string; // used on prescriptions/reports
  /** Salaried in-house vs. fee-split visiting/retainer — the payroll module's RevenueShareRule lookup key (see services/payroll.service.ts). Defaults to IN_HOUSE for every doctor onboarded before Step 11. */
  employmentType: DoctorEmploymentType;
  isActive: boolean;
}

export type DoctorDocument = HydratedDocument<DoctorAttrs>;

const DoctorSchema = new Schema<DoctorAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    employeeCode: { type: String, required: true, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true, maxlength: 150 },
    qualifications: { type: [String], default: [] },
    specializations: { type: [String], required: true, validate: (v: string[]) => v.length > 0 },
    registrationCouncil: { type: String, required: true, trim: true },
    registrationNumber: { type: String, required: true, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    phone: { type: String, required: true, match: PHONE_REGEX },
    email: { type: String, required: true, match: EMAIL_REGEX, lowercase: true },
    consultationFee: { type: Number, required: true, min: 0 },
    followUpFee: { type: Number, min: 0 },
    averageConsultationMinutes: { type: Number, required: true, default: 15, min: 1 },
    signatureStorageKey: { type: String },
    employmentType: {
      type: String,
      required: true,
      enum: Object.values(DoctorEmploymentType),
      default: DoctorEmploymentType.IN_HOUSE,
    },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "doctors" },
);

DoctorSchema.index({ specializations: 1 });
DoctorSchema.index({ departmentId: 1, isActive: 1 });

export const Doctor: Model<DoctorAttrs> = model<DoctorAttrs>("Doctor", DoctorSchema);

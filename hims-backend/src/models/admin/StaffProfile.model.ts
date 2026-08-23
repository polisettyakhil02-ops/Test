import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { SystemRole } from "../../types/common.types.js";

export interface ShiftAssignment {
  wardId?: Types.ObjectId;
  shift: "MORNING" | "EVENING" | "NIGHT";
  effectiveFrom: Date;
  effectiveTo?: Date;
}

/** HR/employment record for non-doctor staff (nurses, pharmacists, lab techs, billing, admin, etc.). Doctors use Doctor.model.ts instead, which carries clinical-specific fields. */
export interface StaffProfileAttrs {
  userId: Types.ObjectId;
  employeeCode: string;
  fullName: string;
  role: SystemRole;
  departmentId: Types.ObjectId;
  designation: string;
  dateOfJoining: Date;
  dateOfLeaving?: Date;
  shiftAssignments: ShiftAssignment[];
  reportingManagerUserId?: string;
  qualifications: string[];
  licenseNumber?: string; // for licensed roles: pharmacist, lab technician
  licenseExpiryDate?: Date;
  isActive: boolean;
}

export type StaffProfileDocument = HydratedDocument<StaffProfileAttrs>;

const ShiftAssignmentSchema = new Schema<ShiftAssignment>(
  {
    wardId: { type: Schema.Types.ObjectId, ref: "Ward" },
    shift: { type: String, required: true, enum: ["MORNING", "EVENING", "NIGHT"] },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
  },
  { _id: false },
);

const StaffProfileSchema = new Schema<StaffProfileAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    employeeCode: { type: String, required: true, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true, maxlength: 150 },
    role: { type: String, required: true, enum: Object.values(SystemRole) },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    designation: { type: String, required: true, trim: true },
    dateOfJoining: { type: Date, required: true },
    dateOfLeaving: { type: Date },
    shiftAssignments: { type: [ShiftAssignmentSchema], default: [] },
    reportingManagerUserId: { type: String },
    qualifications: { type: [String], default: [] },
    licenseNumber: { type: String, trim: true },
    licenseExpiryDate: { type: Date },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "staff_profiles" },
);

StaffProfileSchema.index({ role: 1, isActive: 1 });
StaffProfileSchema.index({ departmentId: 1, isActive: 1 });

export const StaffProfile: Model<StaffProfileAttrs> = model<StaffProfileAttrs>(
  "StaffProfile",
  StaffProfileSchema,
);

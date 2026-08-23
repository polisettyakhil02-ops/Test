import { Schema, model, type Model, type HydratedDocument } from "mongoose";

export interface DepartmentAttrs {
  name: string;
  code: string;
  description?: string;
  headOfDepartmentUserId?: string;
  isClinical: boolean;
  isActive: boolean;
}

export type DepartmentDocument = HydratedDocument<DepartmentAttrs>;

const DepartmentSchema = new Schema<DepartmentAttrs>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String, trim: true, maxlength: 500 },
    headOfDepartmentUserId: { type: String },
    isClinical: { type: Boolean, required: true, default: true },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "departments" },
);

export const Department: Model<DepartmentAttrs> = model<DepartmentAttrs>("Department", DepartmentSchema);

import { Schema, model, type Model, type HydratedDocument } from "mongoose";
import { WardCategory } from "../../types/common.types.js";

export interface WardAttrs {
  name: string;
  code: string; // short code used in bed numbering, e.g. "ICU-A"
  category: WardCategory;
  floor: string;
  totalBedCapacity: number;
  nurseStationExtension?: string;
  headNurseUserId?: string;
  isActive: boolean;
}

export type WardDocument = HydratedDocument<WardAttrs>;

const WardSchema = new Schema<WardAttrs>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    category: { type: String, required: true, enum: Object.values(WardCategory) },
    floor: { type: String, required: true, trim: true },
    totalBedCapacity: { type: Number, required: true, min: 1 },
    nurseStationExtension: { type: String, trim: true },
    headNurseUserId: { type: String },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "wards" },
);

WardSchema.index({ category: 1, isActive: 1 });

export const Ward: Model<WardAttrs> = model<WardAttrs>("Ward", WardSchema);

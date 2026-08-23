import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { AssetCategory, AssetStatus, AssetCriticality, AmcCoverageType } from "../../types/common.types.js";

/**
 * A tracked high-value biomedical device — MRI/CT/ventilators/infusion
 * pumps/etc. Warranty and AMC (Annual Maintenance Contract) dates live
 * here rather than on a separate contract collection: one asset has
 * exactly one active AMC at a time in this design, so embedding keeps
 * "is this device covered right now" a single-document read instead of a
 * join, which is what the AMC-expiry dashboard and every PM/breakdown
 * check needs on every view.
 */
export interface AssetAttrs {
  assetCode: string; // internal tag, e.g. "BME-000042"
  name: string; // e.g. "Siemens MAGNETOM MRI Scanner"
  category: AssetCategory;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  departmentId: Types.ObjectId;
  location: string; // room/ward, free text — a device moves more often than Department does
  purchaseDate: Date;
  purchasePrice: number;
  warrantyExpiryDate?: Date;
  amcVendor?: string;
  amcContractNumber?: string;
  amcCoverageType: AmcCoverageType;
  amcStartDate?: Date;
  amcEndDate?: Date;
  criticality: AssetCriticality;
  status: AssetStatus;
  lastServicedAt?: Date;
  nextPmDueDate?: Date;
  isActive: boolean;
}

export type AssetDocument = HydratedDocument<AssetAttrs>;

const AssetSchema = new Schema<AssetAttrs>(
  {
    assetCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, enum: Object.values(AssetCategory) },
    manufacturer: { type: String, required: true, trim: true },
    modelNumber: { type: String, required: true, trim: true },
    serialNumber: { type: String, required: true, unique: true, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    location: { type: String, required: true, trim: true },
    purchaseDate: { type: Date, required: true },
    purchasePrice: { type: Number, required: true, min: 0 },
    warrantyExpiryDate: { type: Date },
    amcVendor: { type: String, trim: true },
    amcContractNumber: { type: String, trim: true },
    amcCoverageType: { type: String, required: true, enum: Object.values(AmcCoverageType), default: AmcCoverageType.NONE },
    amcStartDate: { type: Date },
    amcEndDate: { type: Date },
    criticality: { type: String, required: true, enum: Object.values(AssetCriticality), default: AssetCriticality.MEDIUM },
    status: { type: String, required: true, enum: Object.values(AssetStatus), default: AssetStatus.ACTIVE },
    lastServicedAt: { type: Date },
    nextPmDueDate: { type: Date },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "assets" },
);

// Biomedical dashboard's two primary views: "what's down right now" and "what needs PM/AMC attention soon".
AssetSchema.index({ status: 1, criticality: 1 });
AssetSchema.index({ amcEndDate: 1 }, { sparse: true });
AssetSchema.index({ nextPmDueDate: 1 }, { sparse: true });

export const Asset: Model<AssetAttrs> = model<AssetAttrs>("Asset", AssetSchema);

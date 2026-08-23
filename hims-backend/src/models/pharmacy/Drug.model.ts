import { Schema, model, type Model, type HydratedDocument } from "mongoose";
import { DrugRoute } from "../../types/common.types.js";

/** The item master. Stock quantities live on DrugBatch (FEFO tracking); this is catalog/reference data only. */
export interface DrugAttrs {
  drugCode: string; // internal SKU
  genericName: string;
  brandName?: string;
  manufacturer: string;
  category: string; // e.g. "Antibiotic", "Analgesic"
  scheduleClass?: "H" | "H1" | "X" | "OTC" | "NARCOTIC"; // regulatory schedule (India Drugs & Cosmetics Act style); OTC/none if unset
  defaultRoute: DrugRoute;
  packagingUnit: string; // e.g. "strip of 10", "bottle of 100ml"
  unitsPerPackage: number;
  reorderLevel: number; // total units across batches below which a low-stock alert fires
  reorderQuantity: number;
  barcodeValue?: string;
  hsnCode?: string; // tax classification
  taxRatePercent: number;
  requiresPrescription: boolean;
  isControlledSubstance: boolean;
  isActive: boolean;
}

export type DrugDocument = HydratedDocument<DrugAttrs>;

const DrugSchema = new Schema<DrugAttrs>(
  {
    drugCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    genericName: { type: String, required: true, trim: true, index: true },
    brandName: { type: String, trim: true },
    manufacturer: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    scheduleClass: { type: String, enum: ["H", "H1", "X", "OTC", "NARCOTIC"] },
    defaultRoute: { type: String, required: true, enum: Object.values(DrugRoute) },
    packagingUnit: { type: String, required: true },
    unitsPerPackage: { type: Number, required: true, min: 1 },
    reorderLevel: { type: Number, required: true, min: 0, default: 0 },
    reorderQuantity: { type: Number, required: true, min: 0, default: 0 },
    barcodeValue: { type: String, unique: true, sparse: true },
    hsnCode: { type: String, trim: true },
    taxRatePercent: { type: Number, required: true, default: 0, min: 0, max: 100 },
    requiresPrescription: { type: Boolean, required: true, default: true },
    isControlledSubstance: { type: Boolean, required: true, default: false },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "drugs" },
);

DrugSchema.index({ genericName: "text", brandName: "text", drugCode: "text" });
DrugSchema.index({ category: 1, isActive: 1 });

export const Drug: Model<DrugAttrs> = model<DrugAttrs>("Drug", DrugSchema);

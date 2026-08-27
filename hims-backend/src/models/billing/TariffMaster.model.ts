import { Schema, model, type Model, type HydratedDocument } from "mongoose";
import { WardCategory } from "../../types/common.types.js";

/** Per-ward-category price for one chargeable service. Bed rent, doctor visit fees, and procedure charges all differ by ward category — this is the pricing source of truth every billing line item resolves against. */
export interface WardCategoryPrice {
  wardCategory: WardCategory;
  price: number;
}

export interface TariffMasterAttrs {
  serviceCode: string;
  serviceName: string;
  serviceCategory:
    | "BED_RENT"
    | "DOCTOR_VISIT"
    | "PROCEDURE"
    | "CONSUMABLE"
    | "LAB_TEST"
    | "PHARMACY"
    | "OT_CHARGE"
    | "NURSING_CHARGE"
    | "MISC";
  basePrice: number; // used when wardCategoryPrices has no override for the applicable category
  wardCategoryPrices: WardCategoryPrice[];
  taxRatePercent: number;
  isTaxInclusive: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date;
  isActive: boolean;
}

export type TariffMasterDocument = HydratedDocument<TariffMasterAttrs>;

const WardCategoryPriceSchema = new Schema<WardCategoryPrice>(
  {
    wardCategory: { type: String, required: true, enum: Object.values(WardCategory) },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const TariffMasterSchema = new Schema<TariffMasterAttrs>(
  {
    serviceCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    serviceName: { type: String, required: true, trim: true },
    serviceCategory: {
      type: String,
      required: true,
      enum: [
        "BED_RENT",
        "DOCTOR_VISIT",
        "PROCEDURE",
        "CONSUMABLE",
        "LAB_TEST",
        "PHARMACY",
        "OT_CHARGE",
        "NURSING_CHARGE",
        "MISC",
      ],
    },
    basePrice: { type: Number, required: true, min: 0 },
    wardCategoryPrices: { type: [WardCategoryPriceSchema], default: [] },
    taxRatePercent: { type: Number, required: true, default: 0, min: 0, max: 100 },
    isTaxInclusive: { type: Boolean, required: true, default: false },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "tariff_masters" },
);

TariffMasterSchema.index({ serviceCategory: 1, isActive: 1 });

export const TariffMaster: Model<TariffMasterAttrs> = model<TariffMasterAttrs>(
  "TariffMaster",
  TariffMasterSchema,
);

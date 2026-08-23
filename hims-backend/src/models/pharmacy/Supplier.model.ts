import { Schema, model, type Model, type HydratedDocument } from "mongoose";
import type { Address } from "../../types/common.types.js";
import { PHONE_REGEX, EMAIL_REGEX } from "../../types/common.types.js";

export interface SupplierAttrs {
  name: string;
  supplierCode: string;
  gstNumber?: string;
  drugLicenseNumber?: string;
  contactPersonName: string;
  phone: string;
  email?: string;
  address: Address;
  paymentTermsDays: number;
  isActive: boolean;
}

export type SupplierDocument = HydratedDocument<SupplierAttrs>;

const AddressSchema = new Schema<Address>(
  {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    postalCode: { type: String, required: true },
  },
  { _id: false },
);

const SupplierSchema = new Schema<SupplierAttrs>(
  {
    name: { type: String, required: true, trim: true },
    supplierCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    gstNumber: { type: String, trim: true },
    drugLicenseNumber: { type: String, trim: true },
    contactPersonName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, match: PHONE_REGEX },
    email: { type: String, match: EMAIL_REGEX, lowercase: true },
    address: { type: AddressSchema, required: true },
    paymentTermsDays: { type: Number, required: true, default: 30, min: 0 },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "suppliers" },
);

export const Supplier: Model<SupplierAttrs> = model<SupplierAttrs>("Supplier", SupplierSchema);

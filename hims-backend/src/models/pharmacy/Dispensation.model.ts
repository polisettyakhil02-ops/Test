import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";

export interface DispensedLine {
  prescriptionItemId: Types.ObjectId;
  drugId: Types.ObjectId;
  batchId: Types.ObjectId;
  quantityDispensed: number;
  unitPriceCharged: number; // MRP at dispense time, snapshotted
  stockTransactionId: Types.ObjectId; // ref -> StockTransaction row created in the same transaction
}

/**
 * The pharmacy counter's fulfillment record for one or more lines of a
 * Prescription. Created by the Pharmacy Stock Dispensation Engine inside
 * a single `withTransaction` call together with the DrugBatch decrements
 * and StockTransaction rows, and (when billable) the Invoice line items —
 * all four writes commit or roll back together.
 */
export interface DispensationAttrs {
  dispensationNumber: string;
  prescriptionId: Types.ObjectId;
  patientId: Types.ObjectId;
  lines: DispensedLine[];
  totalAmount: number;
  invoiceId?: Types.ObjectId;
  dispensedByUserId: string;
  dispensedAt: Date;
}

export type DispensationDocument = HydratedDocument<DispensationAttrs>;

const DispensedLineSchema = new Schema<DispensedLine>(
  {
    prescriptionItemId: { type: Schema.Types.ObjectId, required: true },
    drugId: { type: Schema.Types.ObjectId, ref: "Drug", required: true },
    batchId: { type: Schema.Types.ObjectId, ref: "DrugBatch", required: true },
    quantityDispensed: { type: Number, required: true, min: 1 },
    unitPriceCharged: { type: Number, required: true, min: 0 },
    stockTransactionId: { type: Schema.Types.ObjectId, ref: "StockTransaction", required: true },
  },
  { _id: false },
);

const DispensationSchema = new Schema<DispensationAttrs>(
  {
    dispensationNumber: { type: String, required: true, unique: true, immutable: true },
    prescriptionId: { type: Schema.Types.ObjectId, ref: "Prescription", required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    lines: {
      type: [DispensedLineSchema],
      validate: { validator: (v: DispensedLine[]) => v.length > 0, message: "At least one line is required" },
    },
    totalAmount: { type: Number, required: true, min: 0 },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    dispensedByUserId: { type: String, required: true },
    dispensedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, collection: "dispensations" },
);

DispensationSchema.index({ patientId: 1, dispensedAt: -1 });

export const Dispensation: Model<DispensationAttrs> = model<DispensationAttrs>(
  "Dispensation",
  DispensationSchema,
);

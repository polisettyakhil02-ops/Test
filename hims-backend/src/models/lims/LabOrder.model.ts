import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { EncounterType, LabOrderPriority, LabOrderStatus } from "../../types/common.types.js";

export interface LabOrderTestLine {
  labTestId: Types.ObjectId;
  testCode: string;
  testName: string;
  status: LabOrderStatus;
  specimenId?: Types.ObjectId;
  resultId?: Types.ObjectId;
}

export interface LabOrderAttrs {
  orderNumber: string;
  patientId: Types.ObjectId;
  orderingDoctorId: Types.ObjectId;
  encounterType: EncounterType;
  opdVisitId?: Types.ObjectId;
  admissionId?: Types.ObjectId;
  clinicalNoteId?: Types.ObjectId;
  tests: LabOrderTestLine[];
  priority: LabOrderPriority;
  clinicalNotes?: string; // relevant history for the lab technician
  status: LabOrderStatus;
  invoiceId?: Types.ObjectId;
  orderedAt: Date;
  createdBy: string;
}

export type LabOrderDocument = HydratedDocument<LabOrderAttrs>;

const LabOrderTestLineSchema = new Schema<LabOrderTestLine>(
  {
    labTestId: { type: Schema.Types.ObjectId, ref: "LabTest", required: true },
    testCode: { type: String, required: true },
    testName: { type: String, required: true },
    status: { type: String, required: true, enum: Object.values(LabOrderStatus), default: LabOrderStatus.ORDERED },
    specimenId: { type: Schema.Types.ObjectId, ref: "Specimen" },
    resultId: { type: Schema.Types.ObjectId, ref: "LabResult" },
  },
  { _id: true },
);

const LabOrderSchema = new Schema<LabOrderAttrs>(
  {
    orderNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    orderingDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    encounterType: { type: String, required: true, enum: Object.values(EncounterType) },
    opdVisitId: { type: Schema.Types.ObjectId, ref: "OPDVisit" },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    clinicalNoteId: { type: Schema.Types.ObjectId, ref: "ClinicalNote" },
    tests: {
      type: [LabOrderTestLineSchema],
      validate: { validator: (v: LabOrderTestLine[]) => v.length > 0, message: "At least one test is required" },
    },
    priority: { type: String, required: true, enum: Object.values(LabOrderPriority), default: LabOrderPriority.ROUTINE },
    clinicalNotes: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, required: true, enum: Object.values(LabOrderStatus), default: LabOrderStatus.ORDERED },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    orderedAt: { type: Date, required: true, default: () => new Date() },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "lab_orders" },
);

LabOrderSchema.index({ patientId: 1, orderedAt: -1 });
// Lab worklist board: pending orders by priority.
LabOrderSchema.index({ status: 1, priority: 1, orderedAt: 1 });

export const LabOrder: Model<LabOrderAttrs> = model<LabOrderAttrs>("LabOrder", LabOrderSchema);

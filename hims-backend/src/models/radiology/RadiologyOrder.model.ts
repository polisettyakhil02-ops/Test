import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { EncounterType, AssetCategory, LabOrderPriority, RadiologyOrderStatus } from "../../types/common.types.js";

/**
 * One imaging request. `modality` reuses `AssetCategory` (the Step 11
 * biomedical registry already models `XRAY`/`CT_SCAN`/`MRI`/`ULTRASOUND`
 * as tracked devices) rather than a parallel enum meaning almost the same
 * thing — `radiology.service.ts` constrains it to that imaging subset at
 * order time. `priority` reuses `LabOrderPriority` (STAT/URGENT/ROUTINE):
 * the same triage vocabulary applies to "how fast does this scan need to
 * happen" as it does to lab tests, so a second identical enum would add
 * nothing.
 */
export interface RadiologyOrderAttrs {
  orderNumber: string; // "accession number" in DICOM terms — see radiology.service.ts#getModalityWorklist
  patientId: Types.ObjectId;
  orderingDoctorId: Types.ObjectId;
  encounterType: EncounterType;
  opdVisitId?: Types.ObjectId;
  admissionId?: Types.ObjectId;
  modality: AssetCategory;
  machineAssetId?: Types.ObjectId; // assigned at scheduling time, not necessarily at order time
  bodyPart: string; // e.g. "Chest PA", "Brain w/o contrast", "L-Knee AP/Lat"
  clinicalIndication: string;
  contrastRequired: boolean;
  priority: LabOrderPriority;
  status: RadiologyOrderStatus;
  scheduledAt?: Date;
  performedAt?: Date;
  reportId?: Types.ObjectId;
  invoiceId?: Types.ObjectId;
  orderedAt: Date;
  createdBy: string;
}

export type RadiologyOrderDocument = HydratedDocument<RadiologyOrderAttrs>;

const RadiologyOrderSchema = new Schema<RadiologyOrderAttrs>(
  {
    orderNumber: { type: String, required: true, unique: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    orderingDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    encounterType: { type: String, required: true, enum: Object.values(EncounterType) },
    opdVisitId: { type: Schema.Types.ObjectId, ref: "OPDVisit" },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    modality: { type: String, required: true, enum: Object.values(AssetCategory) },
    machineAssetId: { type: Schema.Types.ObjectId, ref: "Asset", index: true },
    bodyPart: { type: String, required: true, trim: true, maxlength: 150 },
    clinicalIndication: { type: String, required: true, trim: true, maxlength: 1000 },
    contrastRequired: { type: Boolean, required: true, default: false },
    priority: { type: String, required: true, enum: Object.values(LabOrderPriority), default: LabOrderPriority.ROUTINE },
    status: { type: String, required: true, enum: Object.values(RadiologyOrderStatus), default: RadiologyOrderStatus.ORDERED },
    scheduledAt: { type: Date },
    performedAt: { type: Date },
    reportId: { type: Schema.Types.ObjectId, ref: "RadiologyReport" },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    orderedAt: { type: Date, required: true, default: () => new Date() },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "radiology_orders" },
);

RadiologyOrderSchema.index({ patientId: 1, orderedAt: -1 });
// Technician worklist: pending scans by priority/age.
RadiologyOrderSchema.index({ status: 1, priority: 1, orderedAt: 1 });
// The Modality Worklist query's exact access pattern: "what's on machine X's schedule today".
RadiologyOrderSchema.index({ machineAssetId: 1, scheduledAt: 1 });

export const RadiologyOrder: Model<RadiologyOrderAttrs> = model<RadiologyOrderAttrs>("RadiologyOrder", RadiologyOrderSchema);

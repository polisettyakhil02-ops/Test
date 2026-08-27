import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { ICD10_CODE_REGEX, MrdArchiveStatus, IcdCodingStatus, MrdFileRequestType, MrdFileRequestStatus } from "../../types/common.types.js";

export interface IcdCodeEntry {
  code: string;
  description: string;
  isPrimary: boolean;
}

/** One check-out/check-in cycle of the physical folder. */
export interface ArchiveMovement {
  checkedOutAt: Date;
  checkedOutToUserId: string;
  checkedOutReason: string;
  checkedInAt?: Date;
  checkedInByUserId?: string;
}

export interface MrdFileRequest {
  _id: Types.ObjectId;
  requestType: MrdFileRequestType;
  requestedByName: string; // the external requester (law firm, TPA, patient) — not necessarily a system user
  requestedAt: Date;
  purpose: string;
  status: MrdFileRequestStatus;
  fulfilledAt?: Date;
  fulfilledByUserId?: string;
  denialReason?: string;
}

/**
 * The Medical Record Department's ledger for one discharged patient's
 * physical case file: where the folder physically lives, whether it is
 * currently checked out (and to whom), the billing-audit ICD-10 coding
 * finalized against it, and every legal/insurance/patient-copy request
 * logged against it. Created by MRD staff once the physical file reaches
 * the archive room after discharge — not auto-generated at discharge time,
 * since the file's actual arrival in the archive room is a physical event
 * the system can't observe on its own.
 */
export interface MedicalRecordArchiveAttrs {
  archiveNumber: string; // e.g. "MRD-2026-000123"
  admissionId: Types.ObjectId; // unique — one archive record per admission
  patientId: Types.ObjectId;
  fileBarcodeId: string; // the physical folder's own barcode label, unique
  physicalLocation: string; // e.g. "Rack B / Shelf 4 / Row 2"
  status: MrdArchiveStatus;
  currentMovement?: ArchiveMovement; // set only while CHECKED_OUT
  movementHistory: ArchiveMovement[];
  icdCodes: IcdCodeEntry[];
  icdCodingStatus: IcdCodingStatus;
  codedByUserId?: string;
  codedAt?: Date;
  fileRequests: MrdFileRequest[];
  createdBy: string;
}

export type MedicalRecordArchiveDocument = HydratedDocument<MedicalRecordArchiveAttrs>;

const IcdCodeEntrySchema = new Schema<IcdCodeEntry>(
  {
    code: { type: String, required: true, uppercase: true, match: ICD10_CODE_REGEX },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    isPrimary: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const ArchiveMovementSchema = new Schema<ArchiveMovement>(
  {
    checkedOutAt: { type: Date, required: true },
    checkedOutToUserId: { type: String, required: true },
    checkedOutReason: { type: String, required: true, trim: true, maxlength: 500 },
    checkedInAt: { type: Date },
    checkedInByUserId: { type: String },
  },
  { _id: false },
);

const MrdFileRequestSchema = new Schema<MrdFileRequest>(
  {
    requestType: { type: String, required: true, enum: Object.values(MrdFileRequestType) },
    requestedByName: { type: String, required: true, trim: true, maxlength: 200 },
    requestedAt: { type: Date, required: true, default: () => new Date() },
    purpose: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, required: true, enum: Object.values(MrdFileRequestStatus), default: MrdFileRequestStatus.PENDING },
    fulfilledAt: { type: Date },
    fulfilledByUserId: { type: String },
    denialReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: false },
);

const MedicalRecordArchiveSchema = new Schema<MedicalRecordArchiveAttrs>(
  {
    archiveNumber: { type: String, required: true, unique: true, immutable: true },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: true, unique: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    fileBarcodeId: { type: String, required: true, unique: true, trim: true },
    physicalLocation: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, required: true, enum: Object.values(MrdArchiveStatus), default: MrdArchiveStatus.ARCHIVED },
    currentMovement: { type: ArchiveMovementSchema },
    movementHistory: { type: [ArchiveMovementSchema], default: [] },
    icdCodes: { type: [IcdCodeEntrySchema], default: [] },
    icdCodingStatus: { type: String, required: true, enum: Object.values(IcdCodingStatus), default: IcdCodingStatus.PENDING },
    codedByUserId: { type: String },
    codedAt: { type: Date },
    fileRequests: { type: [MrdFileRequestSchema], default: [] },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "medical_record_archives" },
);

// The File Tracker's barcode-scan lookup and the ICD coding queue's dominant query.
MedicalRecordArchiveSchema.index({ patientId: 1 });
MedicalRecordArchiveSchema.index({ icdCodingStatus: 1, createdAt: 1 });
MedicalRecordArchiveSchema.index({ status: 1 });

export const MedicalRecordArchive: Model<MedicalRecordArchiveAttrs> = model<MedicalRecordArchiveAttrs>(
  "MedicalRecordArchive",
  MedicalRecordArchiveSchema,
);

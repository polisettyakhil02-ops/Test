import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import {
  Gender,
  BloodGroup,
  MaritalStatus,
  PayerType,
  type Address,
  type EmergencyContact,
  PHONE_REGEX,
  EMAIL_REGEX,
} from "../../types/common.types.js";
import { redis } from "../../config/redis.js";
import { env } from "../../config/env.js";

/** Government/photo ID proof scanned/uploaded and stored in object storage; this holds only the pointer + metadata. */
export interface IdProofAttachment {
  type: "AADHAAR" | "PAN" | "PASSPORT" | "DRIVING_LICENSE" | "VOTER_ID" | "OTHER";
  idNumberLast4: string; // never store the full number in plaintext; last 4 for display/verification
  storageKey: string; // S3/MinIO object key
  fileName: string;
  mimeType: string;
  uploadedAt: Date;
  uploadedByUserId: string;
}

export interface BiometricRecord {
  type: "FINGERPRINT" | "FACE" | "IRIS";
  templateStorageKey: string; // pointer to encrypted biometric template, never raw biometric data in Mongo
  capturedAt: Date;
  deviceId?: string;
}

export interface InsuranceDetail {
  payerType: PayerType;
  insurerName: string;
  policyNumber: string;
  tpaName?: string;
  groupNumber?: string;
  validFrom: Date;
  validTo: Date;
  sumInsured?: number;
  isPrimary: boolean;
}

export interface PatientAttrs {
  uhid: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: Date;
  isDateOfBirthEstimated: boolean;
  gender: Gender;
  bloodGroup: BloodGroup;
  maritalStatus: MaritalStatus;
  phone: string;
  alternatePhone?: string;
  email?: string;
  address: Address;
  emergencyContacts: EmergencyContact[];
  idProofs: IdProofAttachment[];
  biometrics: BiometricRecord[];
  insuranceDetails: InsuranceDetail[];
  fatherOrHusbandName?: string;
  occupation?: string;
  nationality: string;
  preferredLanguage?: string;
  photoStorageKey?: string;
  knownAllergySummary?: string; // denormalized fast-read summary; source of truth is DrugAllergy collection
  isActive: boolean;
  isDeceased: boolean;
  deceasedAt?: Date;
  mergedIntoPatientId?: Types.ObjectId; // set when a duplicate MPI record is merged
  createdBy: string;
  updatedBy?: string;
}

export type PatientDocument = HydratedDocument<PatientAttrs>;

const AddressSchema = new Schema<Address>(
  {
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    country: { type: String, required: true, trim: true, maxlength: 100 },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
  },
  { _id: false },
);

const EmergencyContactSchema = new Schema<EmergencyContact>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    relationship: { type: String, required: true, trim: true, maxlength: 50 },
    phone: { type: String, required: true, trim: true, match: PHONE_REGEX },
    alternatePhone: { type: String, trim: true, match: PHONE_REGEX },
    address: { type: AddressSchema, required: false },
  },
  { _id: false },
);

const IdProofAttachmentSchema = new Schema<IdProofAttachment>(
  {
    type: {
      type: String,
      required: true,
      enum: ["AADHAAR", "PAN", "PASSPORT", "DRIVING_LICENSE", "VOTER_ID", "OTHER"],
    },
    idNumberLast4: { type: String, required: true, maxlength: 4, minlength: 4 },
    storageKey: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    uploadedAt: { type: Date, required: true, default: () => new Date() },
    uploadedByUserId: { type: String, required: true },
  },
  { _id: false },
);

const BiometricRecordSchema = new Schema<BiometricRecord>(
  {
    type: { type: String, required: true, enum: ["FINGERPRINT", "FACE", "IRIS"] },
    templateStorageKey: { type: String, required: true },
    capturedAt: { type: Date, required: true, default: () => new Date() },
    deviceId: { type: String },
  },
  { _id: false },
);

const InsuranceDetailSchema = new Schema<InsuranceDetail>(
  {
    payerType: { type: String, required: true, enum: Object.values(PayerType) },
    insurerName: { type: String, required: true, trim: true },
    policyNumber: { type: String, required: true, trim: true },
    tpaName: { type: String, trim: true },
    groupNumber: { type: String, trim: true },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    sumInsured: { type: Number, min: 0 },
    isPrimary: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const PatientSchema = new Schema<PatientAttrs>(
  {
    uhid: { type: String, required: true, unique: true, immutable: true, index: true },
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    middleName: { type: String, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    dateOfBirth: { type: Date, required: true },
    isDateOfBirthEstimated: { type: Boolean, required: true, default: false },
    gender: { type: String, required: true, enum: Object.values(Gender) },
    bloodGroup: { type: String, required: true, enum: Object.values(BloodGroup), default: BloodGroup.UNKNOWN },
    maritalStatus: { type: String, required: true, enum: Object.values(MaritalStatus), default: MaritalStatus.UNKNOWN },
    phone: { type: String, required: true, trim: true, match: PHONE_REGEX, index: true },
    alternatePhone: { type: String, trim: true, match: PHONE_REGEX },
    email: { type: String, trim: true, lowercase: true, match: EMAIL_REGEX },
    address: { type: AddressSchema, required: true },
    emergencyContacts: {
      type: [EmergencyContactSchema],
      validate: {
        validator: (v: EmergencyContact[]) => v.length > 0,
        message: "At least one emergency contact is required",
      },
    },
    idProofs: { type: [IdProofAttachmentSchema], default: [] },
    biometrics: { type: [BiometricRecordSchema], default: [] },
    insuranceDetails: { type: [InsuranceDetailSchema], default: [] },
    fatherOrHusbandName: { type: String, trim: true, maxlength: 150 },
    occupation: { type: String, trim: true, maxlength: 100 },
    nationality: { type: String, required: true, default: "IN", trim: true },
    preferredLanguage: { type: String, trim: true },
    photoStorageKey: { type: String },
    knownAllergySummary: { type: String, maxlength: 500 },
    isActive: { type: Boolean, required: true, default: true },
    isDeceased: { type: Boolean, required: true, default: false },
    deceasedAt: { type: Date },
    mergedIntoPatientId: { type: Schema.Types.ObjectId, ref: "Patient" },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  {
    timestamps: true,
    collection: "patients",
  },
);

// Full-text search across common lookup fields at reception desks.
PatientSchema.index({ firstName: "text", lastName: "text", phone: "text", uhid: "text" });
PatientSchema.index({ lastName: 1, firstName: 1, dateOfBirth: 1 });
PatientSchema.index({ "insuranceDetails.policyNumber": 1 }, { sparse: true });
PatientSchema.index({ isActive: 1, isDeceased: 1 });

/**
 * Generates a UHID of the form `<PREFIX>-<YY>-<sequence>` using a Redis
 * atomic counter keyed by year, avoiding a round trip to Mongo (and the
 * write contention a Mongo counter document would cause) on every
 * registration during peak OPD hours.
 */
export async function generateUHID(): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const counterKey = `uhid:counter:${year}`;
  const sequence = await redis.incr(counterKey);
  return `${env.UHID_PREFIX}-${year}-${sequence.toString().padStart(6, "0")}`;
}

export const Patient: Model<PatientAttrs> = model<PatientAttrs>("Patient", PatientSchema);

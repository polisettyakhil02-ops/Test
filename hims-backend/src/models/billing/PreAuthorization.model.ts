import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import { PreAuthStatus } from "../../types/common.types.js";

export interface PreAuthQuery {
  raisedAt: Date;
  raisedByTPA: boolean;
  queryText: string;
  responseText?: string;
  respondedAt?: Date;
  respondedByUserId?: string;
}

/**
 * TPA/insurer pre-authorization workflow for a planned or ongoing
 * admission. The claim's lifecycle continues past approval, through this
 * same `status` field, to `SETTLED` once the final bill is split between
 * insurer and patient — see `insurance.service.ts#settleClaim` (Step 11),
 * which populates `invoiceId`/`tpaApprovedAmount`/`patientCoPayAmount`/
 * `settledAt`/`settlementPaymentId` at that point.
 */
export interface PreAuthorizationAttrs {
  preAuthNumber: string;
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  insurancePolicyId: Types.ObjectId;
  status: PreAuthStatus;
  requestedAmount: number;
  approvedAmount?: number;
  provisionalDiagnosis: string;
  treatingDoctorId: Types.ObjectId;
  estimatedLengthOfStayDays?: number;
  submittedAt?: Date;
  respondedAt?: Date;
  tpaReferenceNumber?: string;
  queries: PreAuthQuery[];
  rejectionReason?: string;
  attachmentStorageKeys: string[];
  /** Set once the final Invoice for this admission is ready to settle against — see settleClaim. */
  invoiceId?: Types.ObjectId;
  /** The insurer's final contribution at settlement — may differ from `approvedAmount` (the pre-auth estimate) once the actual bill is known; never exceeds the invoice's grandTotal. */
  tpaApprovedAmount?: number;
  /** grandTotal - tpaApprovedAmount at settlement — what the patient owes at the counter. */
  patientCoPayAmount?: number;
  settledAt?: Date;
  /** The Payment record settleClaim posts against the Invoice for the TPA's contribution. */
  settlementPaymentId?: Types.ObjectId;
  createdBy: string;
}

export type PreAuthorizationDocument = HydratedDocument<PreAuthorizationAttrs>;

const PreAuthQuerySchema = new Schema<PreAuthQuery>(
  {
    raisedAt: { type: Date, required: true, default: () => new Date() },
    raisedByTPA: { type: Boolean, required: true, default: true },
    queryText: { type: String, required: true },
    responseText: { type: String },
    respondedAt: { type: Date },
    respondedByUserId: { type: String },
  },
  { _id: false },
);

const PreAuthorizationSchema = new Schema<PreAuthorizationAttrs>(
  {
    preAuthNumber: { type: String, required: true, unique: true, immutable: true },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    insurancePolicyId: { type: Schema.Types.ObjectId, ref: "InsurancePolicy", required: true },
    status: { type: String, required: true, enum: Object.values(PreAuthStatus), default: PreAuthStatus.PENDING },
    requestedAmount: { type: Number, required: true, min: 0 },
    approvedAmount: { type: Number, min: 0 },
    provisionalDiagnosis: { type: String, required: true },
    treatingDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    estimatedLengthOfStayDays: { type: Number, min: 0 },
    submittedAt: { type: Date },
    respondedAt: { type: Date },
    tpaReferenceNumber: { type: String, trim: true },
    queries: { type: [PreAuthQuerySchema], default: [] },
    rejectionReason: { type: String, trim: true },
    attachmentStorageKeys: { type: [String], default: [] },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    tpaApprovedAmount: { type: Number, min: 0 },
    patientCoPayAmount: { type: Number, min: 0 },
    settledAt: { type: Date },
    settlementPaymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: "pre_authorizations" },
);

PreAuthorizationSchema.index({ status: 1, createdAt: -1 });

export const PreAuthorization: Model<PreAuthorizationAttrs> = model<PreAuthorizationAttrs>(
  "PreAuthorization",
  PreAuthorizationSchema,
);

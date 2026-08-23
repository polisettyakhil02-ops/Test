import { Schema, model, type Model, type HydratedDocument, type Query } from "mongoose";
import { AuditAction } from "../../types/common.types.js";
import { env } from "../../config/env.js";

/** One changed field, captured for every UPDATE action so a reviewer can see exactly what moved without diffing whole documents. */
export interface FieldChange {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Immutable, field-level audit trail entry. Written by the audit
 * logging interceptor middleware on every controller-level read/write of
 * a protected resource — never edited or deleted after insert (enforced
 * below by blocking update/delete query middleware at the schema level;
 * production deployments should additionally revoke UPDATE/DELETE grants
 * on this collection at the database-user level for defense in depth).
 */
export interface AuditLogAttrs {
  action: AuditAction;
  resourceType: string; // e.g. "Patient", "Prescription", "Invoice"
  resourceId?: string;
  performedByUserId?: string; // absent for LOGIN_FAILED against an unknown username
  performedByUsername?: string;
  performedByRoles?: string[];
  ipAddress: string;
  userAgent?: string;
  fieldChanges?: FieldChange[];
  requestMethod?: string;
  requestPath?: string;
  statusCode?: number;
  reasonDenied?: string; // populated for PERMISSION_DENIED
  occurredAt: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLogAttrs>;

const FieldChangeSchema = new Schema<FieldChange>(
  {
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const AuditLogSchema = new Schema<AuditLogAttrs>(
  {
    action: { type: String, required: true, enum: Object.values(AuditAction) },
    resourceType: { type: String, required: true, index: true },
    resourceId: { type: String, index: true },
    performedByUserId: { type: String, index: true },
    performedByUsername: { type: String },
    performedByRoles: { type: [String], default: [] },
    ipAddress: { type: String, required: true },
    userAgent: { type: String },
    fieldChanges: { type: [FieldChangeSchema], default: undefined },
    requestMethod: { type: String },
    requestPath: { type: String },
    statusCode: { type: Number },
    reasonDenied: { type: String },
    occurredAt: { type: Date, required: true, default: () => new Date(), index: true },
  },
  {
    // No `updatedAt` — an audit row is never updated, only ever inserted.
    timestamps: { createdAt: true, updatedAt: false },
    collection: "audit_logs",
  },
);

AuditLogSchema.index({ resourceType: 1, resourceId: 1, occurredAt: -1 });
AuditLogSchema.index({ performedByUserId: 1, occurredAt: -1 });
// TTL-style retention: auto-purge only after the compliance-mandated
// retention window (default 7 years, see env.AUDIT_LOG_RETENTION_DAYS).
AuditLogSchema.index(
  { occurredAt: 1 },
  { expireAfterSeconds: env.AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 },
);

function forbidMutation(this: Query<unknown, AuditLogDocument>, next: (err?: Error) => void) {
  next(new Error("AuditLog entries are immutable and cannot be updated or deleted"));
}

AuditLogSchema.pre(["updateOne", "updateMany", "findOneAndUpdate"], forbidMutation);
AuditLogSchema.pre(["deleteOne", "deleteMany", "findOneAndDelete"], forbidMutation);

export const AuditLog: Model<AuditLogAttrs> = model<AuditLogAttrs>("AuditLog", AuditLogSchema);

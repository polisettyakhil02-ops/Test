import { Schema, model, type Model, type HydratedDocument } from "mongoose";
import { PermissionAction, SystemRole } from "../../types/common.types.js";

/** One (resource, actions[]) grant, e.g. { resource: "Prescription", actions: ["CREATE","READ"] }. */
export interface PermissionGrant {
  resource: string; // matches the RBAC middleware's resource identifiers, e.g. "Patient", "Invoice", "AuditLog"
  actions: PermissionAction[];
}

/**
 * A named, editable permission matrix. `SystemRole` enum values seed the
 * default roles; `Role` documents let an admin fine-tune grants per
 * deployment without a code change, while the RBAC middleware still keys
 * off `Role.systemRole` for the handful of hard-coded checks (e.g. only
 * SUPER_ADMIN may edit AuditLog retention).
 */
export interface RoleAttrs {
  systemRole: SystemRole;
  displayName: string;
  description?: string;
  permissions: PermissionGrant[];
  isEditable: boolean; // false for SUPER_ADMIN — its grants cannot be narrowed via the UI
}

export type RoleDocument = HydratedDocument<RoleAttrs>;

const PermissionGrantSchema = new Schema<PermissionGrant>(
  {
    resource: { type: String, required: true, trim: true },
    actions: {
      type: [String],
      required: true,
      enum: Object.values(PermissionAction),
      validate: { validator: (v: string[]) => v.length > 0, message: "At least one action is required" },
    },
  },
  { _id: false },
);

const RoleSchema = new Schema<RoleAttrs>(
  {
    systemRole: { type: String, required: true, unique: true, enum: Object.values(SystemRole) },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    permissions: { type: [PermissionGrantSchema], default: [] },
    isEditable: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "roles" },
);

export const Role: Model<RoleAttrs> = model<RoleAttrs>("Role", RoleSchema);

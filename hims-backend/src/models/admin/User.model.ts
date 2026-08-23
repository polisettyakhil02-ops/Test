import { Schema, model, type Model, type HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";
import { SystemRole, EMAIL_REGEX, PHONE_REGEX } from "../../types/common.types.js";

/**
 * The login identity. Clinical/operational profile data (specializations,
 * shift assignments, etc.) lives in Doctor / StaffProfile documents that
 * reference this by `userId` — kept separate so authentication concerns
 * never block on, or get entangled with, HR data changes.
 */
export interface UserAttrs {
  username: string;
  email: string;
  phone?: string;
  passwordHash: string;
  roles: SystemRole[];
  isActive: boolean;
  isLocked: boolean;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  mustChangePassword: boolean;
  passwordChangedAt: Date;
  mfaEnabled: boolean;
  mfaSecretEncrypted?: string;
}

export interface UserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<UserAttrs, UserMethods>;

const BCRYPT_SALT_ROUNDS = 12;

const UserSchema = new Schema<UserAttrs, Model<UserAttrs, object, UserMethods>, UserMethods>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, match: EMAIL_REGEX },
    phone: { type: String, trim: true, match: PHONE_REGEX },
    passwordHash: { type: String, required: true, select: false },
    roles: {
      type: [String],
      required: true,
      enum: Object.values(SystemRole),
      validate: { validator: (v: SystemRole[]) => v.length > 0, message: "At least one role is required" },
    },
    isActive: { type: Boolean, required: true, default: true },
    isLocked: { type: Boolean, required: true, default: false },
    failedLoginAttempts: { type: Number, required: true, default: 0, min: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    mustChangePassword: { type: Boolean, required: true, default: true },
    passwordChangedAt: { type: Date, required: true, default: () => new Date() },
    mfaEnabled: { type: Boolean, required: true, default: false },
    mfaSecretEncrypted: { type: String, select: false },
  },
  { timestamps: true, collection: "users" },
);

UserSchema.index({ roles: 1, isActive: 1 });

UserSchema.methods.comparePassword = async function comparePassword(
  this: UserDocument,
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, BCRYPT_SALT_ROUNDS);
}

export const User = model<UserAttrs, Model<UserAttrs, object, UserMethods>>("User", UserSchema);

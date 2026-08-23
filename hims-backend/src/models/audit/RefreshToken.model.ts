import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";

/**
 * Server-side record backing refresh-token rotation. The JWT itself
 * carries only `jti`; this document is the source of truth for whether
 * that `jti` is still valid. On every refresh, the current token is
 * marked used and superseded by a new one in the same `tokenFamilyId` —
 * presenting an already-used token revokes the entire family, which is
 * the standard reuse-detection defense against a stolen refresh token.
 */
export interface RefreshTokenAttrs {
  jti: string;
  userId: Types.ObjectId;
  tokenFamilyId: string;
  tokenHash: string; // SHA-256 of the raw token; the raw value is never stored
  issuedAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent?: string;
  isRevoked: boolean;
  revokedAt?: Date;
  revokedReason?: "LOGOUT" | "ROTATED" | "REUSE_DETECTED" | "ADMIN_REVOKED" | "PASSWORD_CHANGED";
  supersededByJti?: string;
}

export type RefreshTokenDocument = HydratedDocument<RefreshTokenAttrs>;

const RefreshTokenSchema = new Schema<RefreshTokenAttrs>(
  {
    jti: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenFamilyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true },
    issuedAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String },
    isRevoked: { type: Boolean, required: true, default: false },
    revokedAt: { type: Date },
    revokedReason: {
      type: String,
      enum: ["LOGOUT", "ROTATED", "REUSE_DETECTED", "ADMIN_REVOKED", "PASSWORD_CHANGED"],
    },
    supersededByJti: { type: String },
  },
  { timestamps: true, collection: "refresh_tokens" },
);

RefreshTokenSchema.index({ userId: 1, isRevoked: 1 });
// Auto-purge expired tokens well after expiry (grace window for reuse-detection lookups).
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const RefreshToken: Model<RefreshTokenAttrs> = model<RefreshTokenAttrs>(
  "RefreshToken",
  RefreshTokenSchema,
);

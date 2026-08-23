import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type { Types } from "mongoose";
import { User, type UserDocument } from "../models/admin/User.model.js";
import { StaffProfile } from "../models/admin/StaffProfile.model.js";
import { Doctor } from "../models/opd/Doctor.model.js";
import { Department } from "../models/admin/Department.model.js";
import { RefreshToken } from "../models/audit/RefreshToken.model.js";
import { AuditLog } from "../models/audit/AuditLog.model.js";
import { AuditAction, type SystemRole } from "../types/common.types.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  TokenExpiredError,
  JsonWebTokenError,
} from "../utils/jwt.js";
import { env } from "../config/env.js";
import { AccountDisabledError, AccountLockedError, AuthenticationError, NotFoundError } from "../utils/errors.js";
import { toObjectId } from "../utils/objectId.js";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

export interface AuthUserProfile {
  id: string;
  username: string;
  email: string;
  roles: SystemRole[];
  fullName?: string;
  departmentName?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface RequestContext {
  ipAddress: string;
  userAgent?: string;
}

export interface LoginInput extends RequestContext {
  username: string;
  password: string;
}

export interface LoginResult {
  tokens: IssuedTokens;
  profile: AuthUserProfile;
}

/** SHA-256 of the raw refresh token — `RefreshToken.tokenHash` never stores the usable token itself, only enough to detect a mismatched/tampered presentation. */
function hashRefreshToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Joins the login identity (`User`) to whichever HR/clinical profile
 * carries the human-facing name and department — `Doctor` for doctors,
 * `StaffProfile` for everyone else. A `PATIENT`-role account (no staff
 * record either way) simply returns no fullName/departmentName, which the
 * client already treats as optional.
 */
async function buildProfile(user: Pick<UserDocument, "_id" | "username" | "email" | "roles">): Promise<AuthUserProfile> {
  const [staffProfile, doctorProfile] = await Promise.all([
    StaffProfile.findOne({ userId: user._id }).select("fullName departmentId").lean(),
    Doctor.findOne({ userId: user._id }).select("fullName departmentId").lean(),
  ]);

  const profile = doctorProfile ?? staffProfile;
  const departmentId = profile?.departmentId;
  const department = departmentId ? await Department.findById(departmentId).select("name").lean() : null;

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    roles: user.roles,
    fullName: profile?.fullName,
    departmentName: department?.name,
  };
}

interface AuthAuditEventInput {
  action: AuditAction;
  status: "SUCCESS" | "FAILED";
  ipAddress: string;
  userAgent?: string;
  performedByUserId?: string;
  performedByUsername?: string;
  performedByRoles?: SystemRole[];
  reasonDenied?: string;
}

/**
 * Auth events (LOGIN/LOGIN_FAILED/LOGOUT) are written directly here rather
 * than through the generic `auditLogger` route middleware: that middleware
 * derives the actor from `req.user`, which isn't set yet on `/login` (the
 * whole point of the request) and isn't meaningful on a public/expired
 * `/refresh` call either. This is also the first real use of the
 * dedicated LOGIN/LOGIN_FAILED/LOGOUT `AuditAction` values the schema
 * reserved for exactly this since Step 1.
 */
async function recordAuthAuditEvent(event: AuthAuditEventInput): Promise<void> {
  try {
    await AuditLog.create({
      action: event.action,
      resourceType: "Auth",
      performedByUserId: event.performedByUserId,
      performedByUsername: event.performedByUsername,
      performedByRoles: event.performedByRoles,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      status: event.status,
      reasonDenied: event.reasonDenied,
      occurredAt: new Date(),
    });
  } catch (err) {
    // Audit logging must never take down the auth flow — log-and-swallow,
    // matching the same policy in middlewares/audit.interceptor.ts.
    // eslint-disable-next-line no-console
    console.error("[audit] failed to write auth audit log entry", err);
  }
}

/**
 * Mints a fresh access/refresh pair and persists the refresh token's
 * server-side rotation record. `tokenFamilyId` is preserved across a
 * refresh (same continuous session) and only created fresh at login (a
 * new session/device).
 */
async function issueTokenPair(
  userId: Types.ObjectId,
  username: string,
  roles: SystemRole[],
  context: RequestContext,
  tokenFamilyId?: string,
): Promise<IssuedTokens> {
  const jti = uuidv4();
  const familyId = tokenFamilyId ?? uuidv4();

  const accessToken = signAccessToken({ sub: userId.toString(), username, roles });
  const refreshToken = signRefreshToken({ sub: userId.toString(), jti, tokenFamilyId: familyId });
  const refreshTokenExpiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000);

  await RefreshToken.create({
    jti,
    userId,
    tokenFamilyId: familyId,
    tokenHash: hashRefreshToken(refreshToken),
    issuedAt: new Date(),
    expiresAt: refreshTokenExpiresAt,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    isRevoked: false,
  });

  return { accessToken, refreshToken, refreshTokenExpiresAt };
}

/** Revokes every still-valid token in a session's rotation family — used both for a normal logout and for reuse-detection lockdown. */
async function revokeTokenFamily(
  tokenFamilyId: string,
  reason: "LOGOUT" | "REUSE_DETECTED" | "PASSWORD_CHANGED",
): Promise<void> {
  await RefreshToken.updateMany(
    { tokenFamilyId, isRevoked: false },
    { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: reason } },
  );
}

/**
 * Owns every credential/session concern: password verification and the
 * brute-force lockout counter (`login`), refresh-token rotation with
 * reuse-detection (`refresh`), session teardown (`logout`), and the
 * profile join `GET /api/auth/me` needs (`getProfile`). Mirrors the
 * class-plus-singleton shape every other domain service in this codebase
 * uses (see `BillingService`/`ADTService`/etc.).
 */
export class AuthService {
  /**
   * Bcrypt-verifies the password (via `User.comparePassword`, which needs
   * `passwordHash` explicitly selected — it's `select: false` on the
   * schema) and enforces the `failedLoginAttempts`/`lockedUntil`
   * brute-force counter Step 1 built into the `User` schema for exactly
   * this. On success, issues a brand-new token family.
   *
   * Every failure branch returns the same generic "Invalid username or
   * password" for an unknown username, a deactivated account, or a wrong
   * password, to avoid username enumeration; only an *already*-triggered
   * temporary lockout is disclosed (423, `AccountLockedError`), since by
   * that point the caller has already made enough attempts against this
   * exact username to have effectively confirmed it exists, and a
   * legitimate account owner needs the actionable "come back later"
   * signal.
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const username = input.username.trim().toLowerCase();
    const context: RequestContext = { ipAddress: input.ipAddress, userAgent: input.userAgent };

    const user = await User.findOne({ username }).select("+passwordHash");
    if (!user) {
      await recordAuthAuditEvent({
        action: AuditAction.LOGIN_FAILED,
        status: "FAILED",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        performedByUsername: username,
        reasonDenied: "Unknown username",
      });
      throw new AuthenticationError("Invalid username or password");
    }

    if (!user.isActive || user.isLocked) {
      await recordAuthAuditEvent({
        action: AuditAction.LOGIN_FAILED,
        status: "FAILED",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        performedByUserId: user._id.toString(),
        performedByUsername: user.username,
        reasonDenied: "Account inactive or administratively locked",
      });
      throw new AuthenticationError("Invalid username or password");
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
      await recordAuthAuditEvent({
        action: AuditAction.LOGIN_FAILED,
        status: "FAILED",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        performedByUserId: user._id.toString(),
        performedByUsername: user.username,
        reasonDenied: "Account temporarily locked from repeated failed attempts",
      });
      throw new AccountLockedError(
        `Account is temporarily locked due to repeated failed login attempts. Try again after ${user.lockedUntil.toISOString()}.`,
      );
    }

    const passwordMatches = await user.comparePassword(input.password);
    if (!passwordMatches) {
      const attempts = user.failedLoginAttempts + 1;
      const willLock = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;

      await User.updateOne(
        { _id: user._id },
        willLock
          ? {
              $set: {
                failedLoginAttempts: attempts,
                lockedUntil: new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60_000),
              },
            }
          : { $set: { failedLoginAttempts: attempts } },
      );

      await recordAuthAuditEvent({
        action: AuditAction.LOGIN_FAILED,
        status: "FAILED",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        performedByUserId: user._id.toString(),
        performedByUsername: user.username,
        reasonDenied: willLock ? "Incorrect password — account now locked" : "Incorrect password",
      });
      throw new AuthenticationError("Invalid username or password");
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: { failedLoginAttempts: 0, lastLoginAt: now, lastLoginIp: context.ipAddress },
        $unset: { lockedUntil: "" },
      },
    );

    const tokens = await issueTokenPair(user._id, user.username, user.roles, context);
    const profile = await buildProfile(user);

    await recordAuthAuditEvent({
      action: AuditAction.LOGIN,
      status: "SUCCESS",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      performedByUserId: user._id.toString(),
      performedByUsername: user.username,
      performedByRoles: user.roles,
    });

    return { tokens, profile };
  }

  /**
   * Token rotation with reuse-detection. Every refresh token is
   * single-use: presenting it marks it `ROTATED` and mints a new one in
   * the same `tokenFamilyId`. If a token that's already marked revoked is
   * presented again, that can only mean either a duplicate/replayed
   * request or a stolen token being used after the legitimate client
   * already rotated past it — either way the safe response is to revoke
   * the *entire* family, forcing that session back through a fresh login
   * rather than trusting any surviving sibling token from the same chain.
   */
  async refresh(rawRefreshToken: string, context: RequestContext): Promise<IssuedTokens> {
    let payload;
    try {
      payload = verifyRefreshToken(rawRefreshToken);
    } catch (err) {
      if (err instanceof TokenExpiredError || err instanceof JsonWebTokenError) {
        throw new AuthenticationError("Refresh token is invalid or has expired");
      }
      throw err;
    }

    const record = await RefreshToken.findOne({ jti: payload.jti });
    if (!record || record.tokenHash !== hashRefreshToken(rawRefreshToken)) {
      throw new AuthenticationError("Refresh token is invalid or has expired");
    }

    if (record.isRevoked) {
      await revokeTokenFamily(record.tokenFamilyId, "REUSE_DETECTED");
      await recordAuthAuditEvent({
        action: AuditAction.LOGIN_FAILED,
        status: "FAILED",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        performedByUserId: record.userId.toString(),
        reasonDenied: "Refresh token reuse detected — session family revoked",
      });
      throw new AuthenticationError("Refresh token is invalid or has expired");
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new AuthenticationError("Refresh token is invalid or has expired");
    }

    const user = await User.findById(record.userId).select("username roles isActive isLocked lockedUntil");
    const now = Date.now();
    const isTemporarilyLocked = Boolean(user?.lockedUntil && user.lockedUntil.getTime() > now);
    if (!user || !user.isActive || user.isLocked || isTemporarilyLocked) {
      await revokeTokenFamily(record.tokenFamilyId, "REUSE_DETECTED");
      throw new AccountDisabledError("Account is inactive or locked");
    }

    const newTokens = await issueTokenPair(user._id, user.username, user.roles, context, record.tokenFamilyId);

    record.isRevoked = true;
    record.revokedAt = new Date();
    record.revokedReason = "ROTATED";
    await record.save();

    return newTokens;
  }

  /**
   * Revokes the presented session's entire refresh-token family so a
   * cached-but-unrotated token from the same device can't be replayed
   * after logout. A missing/already-invalid cookie is a no-op, not an
   * error: logging out twice, or logging out with an already-expired
   * session, should still succeed from the client's point of view.
   */
  async logout(rawRefreshToken: string | undefined, context: RequestContext): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    let payload;
    try {
      payload = verifyRefreshToken(rawRefreshToken);
    } catch {
      return;
    }

    const record = await RefreshToken.findOne({ jti: payload.jti });
    if (!record) {
      return;
    }

    await revokeTokenFamily(record.tokenFamilyId, "LOGOUT");

    await recordAuthAuditEvent({
      action: AuditAction.LOGOUT,
      status: "SUCCESS",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      performedByUserId: record.userId.toString(),
    });
  }

  /** GET /api/auth/me — re-fetches and re-joins the profile rather than trusting only the minimal `req.user` claims, so a display-name/department change shows up without waiting for the next token refresh. */
  async getProfile(userId: string): Promise<AuthUserProfile> {
    const id = toObjectId(userId, "userId");
    const user = await User.findById(id).select("username email roles");
    if (!user) {
      throw new NotFoundError("User account no longer exists");
    }
    return buildProfile(user);
  }
}

export const authService = new AuthService();

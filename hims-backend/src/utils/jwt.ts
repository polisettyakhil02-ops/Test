import jwt, { TokenExpiredError, JsonWebTokenError, type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { SystemRole } from "../types/common.types.js";

export interface AccessTokenPayload {
  sub: string; // userId
  username: string;
  roles: SystemRole[];
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  tokenFamilyId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    algorithm: "HS256",
  });
}

/** Throws `TokenExpiredError` / `JsonWebTokenError` (both from the `jsonwebtoken` package) on an invalid/expired token — callers should catch and translate to a 401. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  }) as AccessTokenPayload & JwtPayload;

  if (!decoded.sub || !decoded.username || !Array.isArray(decoded.roles)) {
    throw new JsonWebTokenError("Malformed access token payload");
  }

  return { sub: decoded.sub, username: decoded.username, roles: decoded.roles };
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL_SECONDS,
    algorithm: "HS256",
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: ["HS256"],
  }) as RefreshTokenPayload & JwtPayload;

  if (!decoded.sub || !decoded.jti || !decoded.tokenFamilyId) {
    throw new JsonWebTokenError("Malformed refresh token payload");
  }

  return { sub: decoded.sub, jti: decoded.jti, tokenFamilyId: decoded.tokenFamilyId };
}

const MOBILE_AUDIENCE = "hims-mobile";

export interface MobileAccessTokenPayload {
  sub: string; // userId
  username: string;
  roles: SystemRole[];
  deviceId: string;
}

/**
 * The mobile gateway's strict token strategy: every mobile token carries a
 * mandatory `aud: "hims-mobile"` claim, and `verifyMobileAccessToken`
 * rejects anything without it — so a web-issued `signAccessToken` token
 * (which never sets `aud`) can never be replayed against `/api/mobile/*`,
 * and a mobile token can never be replayed against the web SPA's cookie
 * session either (`verifyAccessToken` doesn't accept an audience-scoped
 * token signed under a different secret). Also carries `deviceId` and
 * defaults to a much shorter TTL than the web access token (see
 * `JWT_MOBILE_ACCESS_TTL_SECONDS`), since a phone that's lost or stolen
 * should have a narrower exposure window than a desktop browser session.
 */
export function signMobileAccessToken(payload: MobileAccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_MOBILE_ACCESS_SECRET ?? env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_MOBILE_ACCESS_TTL_SECONDS,
    algorithm: "HS256",
    audience: MOBILE_AUDIENCE,
  });
}

export function verifyMobileAccessToken(token: string): MobileAccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_MOBILE_ACCESS_SECRET ?? env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
    audience: MOBILE_AUDIENCE,
  }) as MobileAccessTokenPayload & JwtPayload;

  if (!decoded.sub || !decoded.username || !Array.isArray(decoded.roles) || !decoded.deviceId) {
    throw new JsonWebTokenError("Malformed mobile access token payload");
  }

  return { sub: decoded.sub, username: decoded.username, roles: decoded.roles, deviceId: decoded.deviceId };
}

export { TokenExpiredError, JsonWebTokenError };

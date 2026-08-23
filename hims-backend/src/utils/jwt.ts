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

export { TokenExpiredError, JsonWebTokenError };

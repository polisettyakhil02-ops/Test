import type { Request, Response, NextFunction } from "express";
import { verifyMobileAccessToken, TokenExpiredError, JsonWebTokenError } from "../utils/jwt.js";
import { User } from "../models/admin/User.model.js";
import type { AuthenticatedUser } from "../types/express.js";

/**
 * The mobile gateway's own authentication gate — deliberately separate
 * from `auth.middleware.ts#authenticate` rather than a shared function
 * with a flag, since the two are meant to stay strictly non-interchangeable:
 * this only ever reads `Authorization: Bearer <token>` (a mobile app has
 * no cookie jar to rely on, and accepting the web's cookie here would
 * blur the boundary the mobile token's `aud` claim exists to draw) and
 * verifies via `verifyMobileAccessToken`, which rejects any token that
 * doesn't carry `aud: "hims-mobile"` — so a token lifted from a browser's
 * cookie can never authenticate a mobile API call, and vice versa.
 * Attaches the same `req.user` shape `authenticate` does, so every
 * downstream handler (services, `authorizeRoles`) works identically
 * regardless of which gate the request came through.
 */
export async function protectMobile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
    if (!token) {
      res.status(401).json({ error: "AUTHENTICATION_REQUIRED", message: "No mobile access token provided" });
      return;
    }

    let payload;
    try {
      payload = verifyMobileAccessToken(token);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        res.status(401).json({ error: "TOKEN_EXPIRED", message: "Mobile access token has expired" });
        return;
      }
      if (err instanceof JsonWebTokenError) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "Mobile access token is invalid" });
        return;
      }
      throw err;
    }

    const user = await User.findById(payload.sub).select("username email roles isActive isLocked lockedUntil").lean();
    if (!user) {
      res.status(401).json({ error: "USER_NOT_FOUND", message: "User account no longer exists" });
      return;
    }

    const isTemporarilyLocked = Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
    if (!user.isActive || user.isLocked || isTemporarilyLocked) {
      res.status(403).json({ error: "ACCOUNT_DISABLED", message: "Account is inactive or locked" });
      return;
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      roles: user.roles,
    };
    req.user = authenticatedUser;

    next();
  } catch (err) {
    next(err);
  }
}

import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenExpiredError, JsonWebTokenError } from "../utils/jwt.js";
import { User } from "../models/admin/User.model.js";
import type { AuthenticatedUser } from "../types/express.js";

const ACCESS_TOKEN_COOKIE_NAME = "accessToken";

/**
 * Pulls the access token from the secure HTTP-only cookie set at login,
 * falling back to `Authorization: Bearer <token>` for API clients (mobile
 * apps, service-to-service calls) that cannot rely on cookies. The cookie
 * is checked first since it's the primary transport for the browser SPA
 * and can't be read or exfiltrated by client-side JS (XSS-resistant),
 * unlike a header-carried bearer token stored in `localStorage`.
 */
function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE_NAME] as string | undefined;
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }

  return null;
}

/**
 * Verifies the caller's access token and attaches `req.user`. Re-fetches
 * the User record on every request (rather than trusting the JWT claims
 * alone) so a deactivated/locked account or a role change takes effect
 * immediately instead of waiting out the access token's TTL.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "No access token provided",
      });
      return;
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        res.status(401).json({ error: "TOKEN_EXPIRED", message: "Access token has expired" });
        return;
      }
      if (err instanceof JsonWebTokenError) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "Access token is invalid" });
        return;
      }
      throw err;
    }

    const user = await User.findById(payload.sub)
      .select("username email roles isActive isLocked lockedUntil")
      .lean();

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

/**
 * Like `authenticate`, but never rejects the request — it just attaches
 * `req.user` when a valid token is present. Useful for endpoints whose
 * response shape varies for logged-in vs. anonymous callers without
 * requiring auth outright.
 */
export async function authenticateOptional(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select("username email roles isActive isLocked").lean();
    if (user && user.isActive && !user.isLocked) {
      req.user = {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        roles: user.roles,
      };
    }
  } catch {
    // Invalid/expired token on an optional-auth route: proceed unauthenticated rather than failing the request.
  }

  next();
}

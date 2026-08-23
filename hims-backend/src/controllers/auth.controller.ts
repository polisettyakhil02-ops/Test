import type { Request, Response, NextFunction, CookieOptions } from "express";
import { z } from "zod";
import { authService, type IssuedTokens } from "../services/auth.service.js";
import { env } from "../config/env.js";
import { AuthenticationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

const ACCESS_TOKEN_COOKIE_NAME = "accessToken";
const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

/** Same request-context extraction `audit.interceptor.ts` uses, so login/refresh/logout audit rows and rate-limit buckets agree on the caller's IP. */
function getRequestContext(req: Request): { ipAddress: string; userAgent?: string } {
  return {
    ipAddress: req.ip ?? req.socket.remoteAddress ?? "unknown",
    userAgent: req.headers["user-agent"],
  };
}

/**
 * Shared cookie hardening: `httpOnly` so client-side JS can never read
 * either token (the core XSS defense the frontend's in-memory-only token
 * store already relies on), `secure` outside local dev (a plain-HTTP dev
 * server can't set a `Secure` cookie at all), and `sameSite: "strict"` —
 * safe here because the SPA and API are always same-site (the Vite dev
 * proxy in development, the shared Nginx origin in production; see
 * DEPLOYMENT.md), so there's no legitimate cross-site flow to preserve.
 */
function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
  };
}

/**
 * Sets both auth cookies. The access token cookie is scoped to the whole
 * API (`auth.middleware.ts` reads it on every protected route); the
 * refresh token cookie is scoped to `/api/auth` only, since nothing
 * outside `/auth/refresh` and `/auth/logout` ever needs to see it —
 * narrowing its path narrows its exposure.
 */
function setAuthCookies(res: Response, tokens: IssuedTokens): void {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, {
    ...baseCookieOptions(),
    maxAge: env.JWT_ACCESS_TTL_SECONDS * 1000,
    path: "/",
  });
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, {
    ...baseCookieOptions(),
    expires: tokens.refreshTokenExpiresAt,
    path: "/api/auth",
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, { ...baseCookieOptions(), path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { ...baseCookieOptions(), path: "/api/auth" });
}

const LoginSchema = z
  .object({
    username: z.string().min(1, "username is required").max(100),
    password: z.string().min(1, "password is required").max(200),
  })
  .strict();

/**
 * POST /api/auth/login — verifies credentials via `AuthService.login`
 * (bcrypt compare + brute-force lockout counter), then hands the caller
 * both an HTTP-only cookie pair (the primary, XSS-resistant transport)
 * and the access token in the JSON body (so the SPA's in-memory
 * `tokenStore` — see `hims-frontend/src/lib/tokenStore.ts` — has it
 * immediately without waiting on a round-trip, and so non-browser API
 * clients that can't rely on cookies still get a usable bearer token).
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AuthenticationError(formatZodError(parsed.error));
    }

    const context = getRequestContext(req);
    const { tokens, profile } = await authService.login({
      username: parsed.data.username,
      password: parsed.data.password,
      ...context,
    });

    setAuthCookies(res, tokens);
    res.status(200).json({ data: { accessToken: tokens.accessToken, user: profile } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh — rotates the refresh token (reuse-detected via
 * `AuthService.refresh`) using only the HTTP-only cookie; the client
 * never has direct access to the refresh token value, by design. Returns
 * the new access token in the body for the same in-memory-store reason as
 * `login`; the new refresh token only ever exists as the re-set cookie.
 */
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;
    if (!rawRefreshToken) {
      throw new AuthenticationError("No refresh token provided");
    }

    const tokens = await authService.refresh(rawRefreshToken, getRequestContext(req));

    setAuthCookies(res, tokens);
    res.status(200).json({ data: { accessToken: tokens.accessToken } });
  } catch (err) {
    // An invalid/reused/expired refresh token can never be salvaged by
    // retrying with the same cookie, so clear it rather than leaving a
    // dead cookie the client would keep resubmitting.
    clearAuthCookies(res);
    next(err);
  }
}

/**
 * POST /api/auth/logout — best-effort session teardown: revokes the
 * refresh token family server-side (`AuthService.logout`) and always
 * clears both cookies regardless of whether a valid session existed,
 * since the client's goal ("I am logged out now") holds either way.
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;
    await authService.logout(rawRefreshToken, getRequestContext(req));
    clearAuthCookies(res);
    res.status(200).json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me — re-joins the full profile (name/department) for the
 * already-authenticated caller. Protected by `authenticate` at the route
 * level, so `req.user` is guaranteed set here; the frontend calls this on
 * every fresh page load to rehydrate its session from the HTTP-only
 * cookie alone (see `AuthContext.tsx`).
 */
export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }
    const profile = await authService.getProfile(req.user.id);
    res.status(200).json({ data: profile });
  } catch (err) {
    next(err);
  }
}

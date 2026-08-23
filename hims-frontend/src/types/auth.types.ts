import type { SystemRole } from "./common.types";

/** The decoded/returned identity the client keeps in memory. Never the raw access token — that's kept separately (see lib/tokenStore.ts) and never persisted to localStorage. */
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  roles: SystemRole[];
  fullName?: string;
  departmentName?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

// BACKEND GAP: hims-backend does not yet implement POST /api/auth/login,
// POST /api/auth/logout, POST /api/auth/refresh, or GET /api/auth/me.
// Step 2 built the User model, bcrypt hashing, and JWT sign/verify utils
// these would use; Step 3 flagged the login/refresh-rotation service as
// not-yet-built. This is the assumed response contract those routes need
// to satisfy for AuthContext (src/context/AuthContext.tsx) to work.
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface MeResponse {
  user: AuthUser;
}

/** Minimal shape this app reads out of a decoded access-token payload (see lib/jwt.ts). */
export interface AccessTokenClaims {
  sub: string;
  username: string;
  roles: SystemRole[];
  exp: number;
  iat: number;
}

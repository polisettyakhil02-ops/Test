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

/** Mirrors the response body hims-backend's POST /api/auth/login (Step 7) actually returns. */
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

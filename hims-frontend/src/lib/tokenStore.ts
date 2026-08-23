/**
 * Holds the current access token in memory only — never localStorage or
 * sessionStorage, which are readable by any injected script (XSS). The
 * real re-authentication mechanism across page reloads is the HTTP-only
 * refresh cookie the backend sets on login (see AuthContext's bootstrap
 * call to GET /api/auth/me); this in-memory copy exists purely so the
 * axios request interceptor can attach `Authorization: Bearer <token>`
 * synchronously without reaching into React state from outside the
 * component tree.
 */
let currentAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

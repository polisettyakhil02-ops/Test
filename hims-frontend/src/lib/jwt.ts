/**
 * Decodes (never verifies — that only ever happens server-side) the
 * payload of a JWT for read-only display/UX purposes: who's logged in,
 * when the access token expires. Deliberately dependency-free (a JWT
 * payload is just base64url JSON) rather than pulling in `jwt-decode`
 * for one ~10-line function.
 */
export function decodeJwt<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = parts[1];
    if (!payload) {
      return null;
    }
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** True once `expSeconds` (a JWT `exp` claim) is in the past or within `skewSeconds` of expiring. */
export function isTokenExpired(expSeconds: number, skewSeconds = 10): boolean {
  return Date.now() >= (expSeconds - skewSeconds) * 1000;
}

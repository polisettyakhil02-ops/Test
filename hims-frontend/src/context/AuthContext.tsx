import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, setOnAuthFailure, getApiErrorMessage } from "@/lib/axios";
import { getAccessToken, setAccessToken } from "@/lib/tokenStore";
import { decodeJwt } from "@/lib/jwt";
import type { AccessTokenClaims, AuthUser, LoginCredentials, LoginResponse, MeResponse } from "@/types/auth.types";
import type { SystemRole } from "@/types/common.types";
import type { ApiEnvelope } from "@/types/common.types";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: SystemRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Owns the client's auth session: who's logged in, and (via
 * `lib/tokenStore.ts` + `lib/axios.ts`) the in-memory access token those
 * requests carry. `login` decodes the returned JWT to schedule a
 * proactive silent refresh ahead of its `exp`; a full page reload has no
 * token to decode (it's memory-only, never persisted), so it instead
 * rehydrates the session from the HTTP-only refresh cookie via
 * `GET /api/auth/me`.
 *
 * BACKEND GAP: POST /api/auth/login, POST /api/auth/logout, and
 * GET /api/auth/me don't exist yet in hims-backend (see the note in
 * src/types/auth.types.ts) — this context is written against their
 * intended contract so it starts working the moment those routes land.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScheduledRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleProactiveRefresh = useCallback(
    (accessToken: string) => {
      clearScheduledRefresh();
      const claims = decodeJwt<AccessTokenClaims>(accessToken);
      if (!claims?.exp) {
        return;
      }
      // Refresh 60s before expiry, but never schedule a negative delay.
      const delayMs = Math.max(claims.exp * 1000 - Date.now() - 60_000, 5_000);
      refreshTimerRef.current = setTimeout(() => {
        api
          .post<ApiEnvelope<{ accessToken: string }>>("/auth/refresh")
          .then((response) => {
            const { accessToken: refreshed } = response.data.data;
            setAccessToken(refreshed);
            scheduleProactiveRefresh(refreshed);
          })
          .catch(() => {
            // The reactive 401 -> refresh flow in lib/axios.ts is the
            // fallback if this proactive attempt fails silently.
          });
      }, delayMs);
    },
    [clearScheduledRefresh],
  );

  const clearSession = useCallback(() => {
    clearScheduledRefresh();
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, [clearScheduledRefresh]);

  // Wired to lib/axios.ts so an unrecoverable 401 (refresh also failed)
  // clears this context's state too, not just the in-memory token.
  useEffect(() => {
    setOnAuthFailure(clearSession);
  }, [clearSession]);

  // Bootstrap on first load: no access token survives a page reload by
  // design (see lib/tokenStore.ts), so ask the server to rehydrate the
  // session from the HTTP-only refresh cookie.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    api
      .get<ApiEnvelope<MeResponse["user"]>>("/auth/me")
      .then((response) => {
        if (cancelled) return;
        setUser(response.data.data);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("unauthenticated");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      setStatus("loading");
      try {
        const response = await api.post<ApiEnvelope<LoginResponse>>("/auth/login", credentials);
        const { accessToken, user: loggedInUser } = response.data.data;
        setAccessToken(accessToken);
        setUser(loggedInUser);
        setStatus("authenticated");
        scheduleProactiveRefresh(accessToken);
      } catch (error) {
        setStatus("unauthenticated");
        throw new Error(getApiErrorMessage(error));
      }
    },
    [scheduleProactiveRefresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Best-effort — clear local state regardless of whether the server call succeeded.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const hasRole = useCallback((...roles: SystemRole[]) => Boolean(user && roles.some((r) => user.roles.includes(r))), [
    user,
  ]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated" && user !== null,
      login,
      logout,
      hasRole,
    }),
    [user, status, login, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return ctx;
}

/** Re-exported for callers outside AuthContext.tsx that only need the current token synchronously (e.g. a download link that can't go through axios). */
export { getAccessToken };

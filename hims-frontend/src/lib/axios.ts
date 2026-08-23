import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getAccessToken, setAccessToken } from "./tokenStore";
import type { RefreshResponse } from "@/types/auth.types";
import type { ApiErrorBody } from "@/types/common.types";

const baseURL = import.meta.env.VITE_API_BASE_URL || "/api";

export const api = axios.create({
  baseURL,
  // Sends the HTTP-only auth cookie set by hims-backend on every request;
  // the Authorization header below is a defense-in-depth / non-cookie-flow
  // fallback (hims-backend's auth.middleware checks the cookie first).
  withCredentials: true,
});

// Request interceptor: attach the in-memory access token, if we have one.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

/** Registered once by AuthContext so this module can clear auth state on an unrecoverable 401 without importing React context into a non-component file. */
let onAuthFailure: (() => void) | null = null;
export function setOnAuthFailure(callback: () => void): void {
  onAuthFailure = callback;
}

// BACKEND GAP: POST /api/auth/refresh doesn't exist yet — see the note in
// src/types/auth.types.ts. Uses a bare axios call (not `api`) so a failed
// refresh can never recursively trigger this same response interceptor.
let refreshInFlight: Promise<string> | null = null;
async function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post<{ data: RefreshResponse }>(`${baseURL}/auth/refresh`, undefined, { withCredentials: true })
      .then((response) => {
        const { accessToken } = response.data.data;
        setAccessToken(accessToken);
        return accessToken;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

// Response interceptor: on a 401 caused by an expired access token, try
// exactly one silent refresh (via the HTTP-only refresh cookie) and
// replay the original request; any other failure — including a failed
// refresh — clears auth state and lets the caller's own error handling
// take over.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.error;

    if (status === 401 && code === "TOKEN_EXPIRED" && config && !config._retried) {
      config._retried = true;
      try {
        const newToken = await refreshAccessToken();
        config.headers.set("Authorization", `Bearer ${newToken}`);
        return api(config);
      } catch {
        setAccessToken(null);
        onAuthFailure?.();
        return Promise.reject(error);
      }
    }

    if (status === 401) {
      setAccessToken(null);
      onAuthFailure?.();
    }

    return Promise.reject(error);
  },
);

/** Pulls the human-readable message out of an hims-backend error response, falling back to the raw Error message. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    if (body?.message) {
      return body.message;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}

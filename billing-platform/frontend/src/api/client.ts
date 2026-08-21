/**
 * The one place the browser talks to the API.
 *
 * Everything goes through `request`, so authentication, error shape and the
 * base URL are decided once. A 401 anywhere clears the session and sends you to
 * the login screen rather than rendering a half-empty page.
 */

/** Empty means same-origin — the reverse proxy, or Vite's dev proxy. */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string>

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
    this.name = 'ApiError'
  }
}

type Listener = () => void
const unauthorizedListeners = new Set<Listener>()

/** Notifies the app when the session has gone, so it can redirect once. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener)
  // Returns void, not Set.delete's boolean — React treats any returned value
  // from an effect as a cleanup function.
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, {
    ...init,
    // The session is an httpOnly cookie, so it has to be sent explicitly on a
    // cross-origin request.
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  if (response.status === 401) {
    for (const listener of unauthorizedListeners) listener()
    throw new ApiError(401, 'Your session has expired. Sign in again.')
  }

  if (response.status === 204) return undefined as T

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? `Request failed (${response.status}).`,
      payload?.fieldErrors ?? {},
    )
  }

  return payload as T
}

const get = <T,>(path: string) => request<T>(path)
const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
const patch = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
const del = <T,>(path: string) => request<T>(path, { method: 'DELETE' })

/** A URL for something the browser fetches directly — a PDF, a CSV. */
export const fileUrl = (path: string) => `${BASE}/api${path}`

/**
 * Downloads a file the API generates.
 *
 * Goes through fetch rather than a bare link so the session cookie is sent on a
 * cross-origin request — a plain <a href> would not carry it, and the download
 * would come back as a 401 page.
 */
export async function download(path: string, fallbackName: string) {
  const response = await fetch(fileUrl(path), { credentials: 'include' })
  if (!response.ok) {
    const isJson = response.headers.get('content-type')?.includes('application/json')
    const payload = isJson ? await response.json() : null
    throw new ApiError(response.status, payload?.error ?? 'Could not download that file.')
  }

  const disposition = response.headers.get('content-disposition') ?? ''
  const named = /filename="?([^"]+)"?/.exec(disposition)?.[1]
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = named ?? fallbackName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const api = { get, post, patch, del }

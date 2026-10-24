// Base URL of the api/ functions. Empty on the web build (same origin); set VITE_API_BASE
// when the frontend is served from elsewhere (e.g. a desktop webview) and the API stays on Vercel.
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

export const apiUrl = (path: string): string => `${API_BASE}${path}`

/** True for a request URL that goes to the api/ functions. */
export function isApiUrl(url: string): boolean {
  try {
    const u = new URL(url, location.href)
    const origin = API_BASE ? new URL(API_BASE).origin : location.origin
    return u.origin === origin && u.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

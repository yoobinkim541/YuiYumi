// Base URL of the api/ functions. Empty on the web build (same origin); set VITE_API_BASE
// when the frontend is served from elsewhere (e.g. a desktop webview) and the API stays on Vercel.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

export const apiUrl = (path: string): string => `${BASE}${path}`

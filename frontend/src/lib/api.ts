/**
 * Base URL for the FastAPI backend.
 *
 * Set NEXT_PUBLIC_API_BASE_URL in the environment (Vercel: the Render service URL).
 * Falls back to the local dev server so `npm run dev` works with no configuration.
 */
const DEFAULT_API_BASE_URL = "http://localhost:8000";

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const base = configured && configured.length > 0 ? configured : DEFAULT_API_BASE_URL;
  // Normalise so joining never produces a double slash or drops a path prefix.
  return base.replace(/\/+$/, "");
}

/** Joins a path onto the API base URL, tolerating a leading slash either way. */
export function apiUrl(path: string): string {
  return `${getApiBaseUrl()}/${path.replace(/^\/+/, "")}`;
}

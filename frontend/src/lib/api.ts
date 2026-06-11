import { currentPublicVenueSlug } from "./publicVenue";

const defaultApiUrl = "http://localhost/Resrva/api/index.php";

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

const apiBase = import.meta.env.VITE_API_URL || defaultApiUrl;

export function apiUrl(route: string): string {
  const [path, query = ""] = route.split("?");
  const params = new URLSearchParams(query);
  const browserParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const venueSlug = browserParams?.get("venue") || browserParams?.get("venue_slug") || currentPublicVenueSlug();
  if (venueSlug && !params.has("venue") && !params.has("venue_slug")) {
    params.set("venue", venueSlug);
  }

  const queryString = params.toString();
  const separator = apiBase.includes("?") ? "&" : "?";
  return `${apiBase}${separator}r=${encodeURIComponent(path)}${queryString ? `&${queryString}` : ""}`;
}

export async function apiFetch<T>(
  route: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiUrl(route), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      payload.error || "The request could not be completed.",
      response.status,
      payload.details || null,
    );
  }

  return payload as T;
}

export async function apiUpload<T>(
  route: string,
  body: FormData,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiUrl(route), {
    credentials: "include",
    ...options,
    method: options.method || "POST",
    body,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      payload.error || "The upload could not be completed.",
      response.status,
      payload.details || null,
    );
  }

  return payload as T;
}

export function toJsonBody(data: unknown): Pick<RequestInit, "body"> {
  return { body: JSON.stringify(data) };
}

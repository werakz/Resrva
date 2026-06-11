const reservedPublicSegments = new Set(["app", "signin", "functions", "terms"]);

export function currentPublicVenueSlug(): string {
  if (typeof window === "undefined") return "";

  const [firstSegment = ""] = window.location.pathname.split("/").filter(Boolean);
  if (!firstSegment || reservedPublicSegments.has(firstSegment)) return "";

  return firstSegment;
}

export function publicVenuePath(path = ""): string {
  const cleanPath = path.replace(/^\/+/, "");
  const slug = currentPublicVenueSlug();

  if (!slug) {
    return cleanPath ? `/${cleanPath}` : "/";
  }

  return cleanPath ? `/${slug}/${cleanPath}` : `/${slug}`;
}

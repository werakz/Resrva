import type { CSSProperties } from "react";

const DEFAULT_BOOKING_TYPE_COLOUR = "#276749";

export function bookingTypeColourValue(colour?: string | null): string {
  return colour && /^#[0-9A-Fa-f]{6}$/.test(colour) ? colour : DEFAULT_BOOKING_TYPE_COLOUR;
}

export function bookingTypeColourVars(colour?: string | null): CSSProperties {
  return {
    "--booking-type-colour": bookingTypeColourValue(colour),
  } as CSSProperties;
}

export function bookingTypeSoftStyle(colour?: string | null): CSSProperties {
  return {
    ...bookingTypeColourVars(colour),
    borderColor: "var(--booking-type-colour)",
    backgroundColor: "color-mix(in srgb, var(--booking-type-colour) 12%, white)",
    color: "var(--booking-type-colour)",
  };
}

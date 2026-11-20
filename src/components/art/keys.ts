/** Banner illustration keys. Plain data so server code can validate without importing the SVG components. */
export const ART_KEYS = ["gift", "ticket", "envelope", "balls", "phone-check", "phone-share", "trophy", "coins"] as const;
export type ArtKey = (typeof ART_KEYS)[number];

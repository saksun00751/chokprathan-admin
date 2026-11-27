/** Who may open an uploaded file in the back office. Pure. */
type Kind = "banner" | "slip";

/** Logos, the icon and the share image: public, and their names are random and never reused. */
export const isBrandFile = (name: string, kind: Kind) => kind === "banner" && name.startsWith("brand-");

export function mayViewMedia(name: string, kind: Kind, viewer: { signedIn: boolean; finance: boolean }): boolean {
  return isBrandFile(name, kind) || viewer.finance || (kind === "banner" && viewer.signedIn);
}

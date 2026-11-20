/** Site color themes. The CSS for each lives in globals.css under :root[data-theme="..."]; names live in the admin dictionary. */
export const THEMES = [
  {
    id: "royal",
    swatch: ["oklch(0.30 0.12 284)", "oklch(0.46 0.19 282)", "oklch(0.84 0.13 84)"],
  },
  {
    id: "emerald",
    swatch: ["oklch(0.30 0.08 162)", "oklch(0.47 0.13 158)", "oklch(0.84 0.13 84)"],
  },
  {
    id: "sapphire",
    swatch: ["oklch(0.30 0.11 258)", "oklch(0.48 0.17 255)", "oklch(0.84 0.13 84)"],
  },
  {
    id: "ruby",
    swatch: ["oklch(0.30 0.11 18)", "oklch(0.48 0.18 18)", "oklch(0.84 0.13 84)"],
  },
  {
    id: "sunset",
    swatch: ["oklch(0.32 0.10 38)", "oklch(0.52 0.16 42)", "oklch(0.84 0.13 84)"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "royal";
export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

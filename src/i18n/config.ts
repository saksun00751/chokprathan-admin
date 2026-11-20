/** Supported languages. Thai is the default and the source language of every dictionary. */
export const LOCALES = ["th", "en", "lo", "my", "km"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "th";
export const LOCALE_COOKIE = "cp_locale";

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** Native names for the language switcher and the `<html lang>` value. Dates are formatted in format.ts. */
export const LOCALE_META: Record<Locale, { native: string; english: string; htmlLang: string }> = {
  th: { native: "ไทย", english: "Thai", htmlLang: "th" },
  en: { native: "English", english: "English", htmlLang: "en" },
  lo: { native: "ລາວ", english: "Lao", htmlLang: "lo" },
  my: { native: "မြန်မာ", english: "Burmese", htmlLang: "my" },
  km: { native: "ខ្មែរ", english: "Khmer", htmlLang: "km" },
};

/** Pick the best supported language from an Accept-Language header. */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const wanted = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}

/** "/en/lotto" -> "/lotto"; unprefixed paths are returned as they are. */
export function stripLocale(pathname: string): string {
  const first = pathname.split("/")[1] ?? "";
  return isLocale(first) ? pathname.slice(first.length + 1) || "/" : pathname;
}

import { LOCALES } from "@/i18n/config";

/**
 * Keep only known languages (not Thai, which lives in the main columns) and known fields, trimmed
 * to the same limits as the Thai text. Languages with every field empty are dropped.
 */
export function cleanContentI18n<K extends string>(input: unknown, limits: Record<K, number>): Partial<Record<string, Partial<Record<K, string>>>> {
  const out: Partial<Record<string, Partial<Record<K, string>>>> = {};
  if (typeof input !== "object" || input === null) return out;
  for (const lang of LOCALES) {
    if (lang === "th") continue;
    const v = (input as Record<string, unknown>)[lang];
    if (typeof v !== "object" || v === null) continue;
    const entry: Partial<Record<K, string>> = {};
    for (const key of Object.keys(limits) as K[]) {
      const raw = (v as Record<string, unknown>)[key];
      const text = typeof raw === "string" ? raw.trim().slice(0, limits[key]) : "";
      if (text) entry[key] = text;
    }
    if (Object.keys(entry).length) out[lang] = entry;
  }
  return out;
}

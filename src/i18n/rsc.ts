import { lang as rootLang } from "next/root-params";
import { applyAdminBranding } from "@/domain/branding";
import { getBranding } from "@/server/branding";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { loadDict, type Dict } from "./dictionaries";

/**
 * Language and dictionary for Server Components, from the [lang] root segment. Static: it does
 * not make a page dynamic, so every language gets its own prerendered shell.
 */
export async function getLang(): Promise<Locale> {
  const value = await rootLang();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getI18n(): Promise<{ lang: Locale; t: Dict }> {
  const lang = await getLang();
  const [dict, branding] = await Promise.all([loadDict(lang), getBranding()]);
  return { lang, t: applyAdminBranding(dict, branding, lang) };
}

type PageMetaKey = { [K in keyof Dict["meta"]]: Dict["meta"][K] extends { title: string } ? K : never }[keyof Dict["meta"]];

/** `export const generateMetadata = () => pageMeta("lotto")`: the page's title and description in its language. */
export async function pageMeta(key: PageMetaKey): Promise<{ title: string; description?: string }> {
  const { t } = await getI18n();
  const m = t.meta[key] as { title: string; description?: string };
  return { title: m.title, ...(m.description ? { description: m.description } : {}) };
}

/** `export const generateMetadata = () => titled((t) => t.admin.ops.rounds.title)` for pages whose title is not in `meta`. */
export async function titled(pick: (t: Dict) => string): Promise<{ title: string }> {
  const { t } = await getI18n();
  return { title: pick(t) };
}

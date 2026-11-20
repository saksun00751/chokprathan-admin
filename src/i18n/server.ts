import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { loadDict, type Dict } from "./dictionaries";

/**
 * Language for Server Actions, route handlers, and services. The proxy forwards the page's
 * language in `x-locale`; the cookie is the fallback; outside a request (scheduler, CLI, tests)
 * it is Thai.
 */
export async function serverLocale(): Promise<Locale> {
  try {
    const h = (await headers()).get("x-locale");
    if (isLocale(h)) return h;
  } catch {
    // not inside a request
  }
  try {
    const c = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(c)) return c;
  } catch {
    // not inside a request
  }
  return DEFAULT_LOCALE;
}

export async function serverI18n(): Promise<{ lang: Locale; t: Dict }> {
  const lang = await serverLocale();
  return { lang, t: await loadDict(lang) };
}

/** The server-message namespace in the request's language (services and actions). */
export async function errorsT(): Promise<Dict["errors"]> {
  return (await serverI18n()).t.errors;
}

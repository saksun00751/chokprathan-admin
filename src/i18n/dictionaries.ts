import "server-only";
import type { Locale } from "./config";
import type th from "./locales/th";

export type Dict = typeof th;

/** Each language loads on demand, so a page only ever holds its own language in memory. */
const loaders: Record<Locale, () => Promise<Dict>> = {
  th: () => import("./locales/th").then((m) => m.default),
  en: () => import("./locales/en").then((m) => m.default),
  lo: () => import("./locales/lo").then((m) => m.default),
  my: () => import("./locales/my").then((m) => m.default),
  km: () => import("./locales/km").then((m) => m.default),
};

export const loadDict = (lang: Locale): Promise<Dict> => loaders[lang]();

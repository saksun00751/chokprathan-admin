"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./config";
import type { Dict } from "./dictionaries";

type Value = { lang: Locale; t: Dict };
const Ctx = createContext<Value | null>(null);

/**
 * Hands dictionaries to Client Components. The root layout passes the site namespaces; the
 * back-office layout nests a second provider that adds the admin namespace.
 */
export function I18nProvider({ lang, t, children }: { lang: Locale; t: Partial<Dict>; children: ReactNode }) {
  const parent = useContext(Ctx);
  const value = useMemo<Value>(() => ({ lang, t: { ...(parent?.t ?? {}), ...t } as Dict }), [lang, t, parent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

import type { ReactNode } from "react";
import { I18nProvider } from "./client";
import type { Dict } from "./dictionaries";
import { getI18n } from "./rsc";

/**
 * Adds whole namespaces to the client dictionary for one part of the tree, so only pages that
 * need them pay for them. Pass namespaces the root layout does not already send.
 */
export async function Provide({ ns, children }: { ns: (keyof Dict)[]; children: ReactNode }) {
  const { lang, t } = await getI18n();
  const picked: Partial<Dict> = {};
  for (const k of ns) (picked as Record<string, unknown>)[k] = t[k];
  return (
    <I18nProvider lang={lang} t={picked}>
      {children}
    </I18nProvider>
  );
}

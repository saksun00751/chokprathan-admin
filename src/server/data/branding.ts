import "server-only";
import { io } from "next/cache";
import { BRAND_PAGES, type Branding, type BrandPage } from "@/domain/branding";
import { LOCALES, type Locale } from "@/i18n/config";
import { loadDict } from "@/i18n/dictionaries";
import { readBranding } from "@/server/services/branding";
import { requireEmployee } from "@/server/session";

/** The built-in text of one language, shown as placeholders. */
export interface BrandDefaults {
  name: string;
  tagline: string;
  description: string;
  pages: Record<BrandPage, { title: string; description: string }>;
}

export async function getBrandingPage(): Promise<{ branding: Branding; defaults: Record<Locale, BrandDefaults> }> {
  await requireEmployee("settings.manage");
  await io();
  const entries = await Promise.all(
    LOCALES.map(async (lang) => {
      const t = await loadDict(lang);
      const pages = Object.fromEntries(
        // Some pages (contact) ship no description of their own: they show the site's.
        BRAND_PAGES.map((p) => {
          const m: { title: string; description?: string } = t.meta[p];
          return [p, { title: m.title, description: m.description ?? "" }];
        }),
      ) as BrandDefaults["pages"];
      return [lang, { name: t.common.brand, tagline: t.meta.tagline, description: t.meta.description, pages }] as const;
    }),
  );
  return { branding: await readBranding(), defaults: Object.fromEntries(entries) as Record<Locale, BrandDefaults> };
}

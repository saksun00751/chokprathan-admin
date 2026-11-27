/**
 * Site name, meta text and images set by staff. Pure; the same file in the back office and the
 * member site. Anything left empty keeps what the code ships with.
 */
import { LOCALES, type Locale } from "@/i18n/config";

export const BRAND_PAGES = ["lotto", "results", "payrate", "rules", "promotions", "contact"] as const;
export type BrandPage = (typeof BRAND_PAGES)[number];
export const BRAND_SLOTS = ["logo", "adminLogo", "icon", "share"] as const;
export type BrandSlot = (typeof BRAND_SLOTS)[number];
export const BRAND_LIMITS = { name: 40, adminName: 40, tagline: 120, description: 300, pageTitle: 70, pageDescription: 300 } as const;

export type Text5 = Partial<Record<Locale, string>>;
export type PageText = { title?: Text5; description?: Text5 };

export interface BrandText {
  name: Text5;
  adminName: Text5;
  tagline: Text5;
  description: Text5;
  pages: Partial<Record<BrandPage, PageText>>;
  /** Hide the name beside the logo, for a logo that already spells it. */
  hideName: boolean;
}

/** Image fields hold a file name in the upload store. */
export type Branding = BrandText & Record<BrandSlot, string | null>;

export const DEFAULT_BRANDING: Branding = {
  name: {},
  adminName: {},
  tagline: {},
  description: {},
  pages: {},
  hideName: false,
  logo: null,
  adminLogo: null,
  icon: null,
  share: null,
};

const FILE = /^brand-[a-z0-9-]{1,34}\.(webp|png)$/;

export const isBrandPage = (v: unknown): v is BrandPage => (BRAND_PAGES as readonly unknown[]).includes(v);
export const isBrandSlot = (v: unknown): v is BrandSlot => (BRAND_SLOTS as readonly unknown[]).includes(v);

const record = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function text5(input: unknown, max: number): Text5 {
  const v = record(input);
  const out: Text5 = {};
  for (const lang of LOCALES) {
    const raw = v[lang];
    const text = typeof raw === "string" ? raw.trim().slice(0, max).trim() : "";
    if (text) out[lang] = text;
  }
  return out;
}

const filled = (t: Text5) => Object.keys(t).length > 0;

export function cleanBrandText(input: unknown): BrandText {
  const v = record(input);
  const pagesIn = record(v.pages);
  const pages: BrandText["pages"] = {};
  for (const page of BRAND_PAGES) {
    const title = text5(record(pagesIn[page]).title, BRAND_LIMITS.pageTitle);
    const description = text5(record(pagesIn[page]).description, BRAND_LIMITS.pageDescription);
    const entry: PageText = { ...(filled(title) ? { title } : {}), ...(filled(description) ? { description } : {}) };
    if (Object.keys(entry).length) pages[page] = entry;
  }
  return {
    name: text5(v.name, BRAND_LIMITS.name),
    adminName: text5(v.adminName, BRAND_LIMITS.adminName),
    tagline: text5(v.tagline, BRAND_LIMITS.tagline),
    description: text5(v.description, BRAND_LIMITS.description),
    pages,
    hideName: !!v.hideName,
  };
}

export function cleanBranding(input: unknown): Branding {
  const v = record(input);
  const file = (x: unknown) => (typeof x === "string" && FILE.test(x) ? x : null);
  return { ...cleanBrandText(v), logo: file(v.logo), adminLogo: file(v.adminLogo), icon: file(v.icon), share: file(v.share) };
}

/** The text written for this language, else the Thai one. */
export const pickText = (text: Text5 | undefined, lang: Locale): string | undefined => text?.[lang] || text?.th || undefined;

type Branded = { common: { brand: string }; meta: { tagline: string; description: string } };

export function applyBranding<D extends Branded>(dict: D, b: Branding, lang: Locale): D {
  return {
    ...dict,
    common: { ...dict.common, brand: pickText(b.name, lang) ?? dict.common.brand },
    meta: {
      ...dict.meta,
      tagline: pickText(b.tagline, lang) ?? dict.meta.tagline,
      description: pickText(b.description, lang) ?? dict.meta.description,
    },
  };
}

export const adminBrandName = (b: Branding, lang: Locale): string | undefined => pickText(b.adminName, lang) ?? pickText(b.name, lang);

export function applyAdminBranding<D extends Branded>(dict: D, b: Branding, lang: Locale): D {
  return { ...dict, common: { ...dict.common, brand: adminBrandName(b, lang) ?? dict.common.brand } };
}

export function pageOverride(b: Branding, page: BrandPage, lang: Locale): { title?: string; description?: string } {
  const title = pickText(b.pages[page]?.title, lang);
  const description = pickText(b.pages[page]?.description, lang);
  return { ...(title ? { title } : {}), ...(description ? { description } : {}) };
}

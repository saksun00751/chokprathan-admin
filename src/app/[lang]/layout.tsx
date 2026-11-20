import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, Noto_Sans_Khmer, Noto_Sans_Lao, Noto_Sans_Myanmar } from "next/font/google";
import { notFound } from "next/navigation";
import { lang as rootLang } from "next/root-params";
import { ArtDefs } from "@/components/art/defs";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/i18n/client";
import { LOCALES, LOCALE_META, isLocale, type Locale } from "@/i18n/config";
import { loadDict } from "@/i18n/dictionaries";
import { getThemeId } from "@/server/theme";
import "../globals.css";

const plex = IBM_Plex_Sans_Thai({
  variable: "--font-plex",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
// Script fonts for Lao, Burmese, and Khmer. Each page only applies (and downloads) its own.
const lao = Noto_Sans_Lao({ variable: "--font-script", subsets: ["lao"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
const myanmar = Noto_Sans_Myanmar({ variable: "--font-script", subsets: ["myanmar"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
const khmer = Noto_Sans_Khmer({ variable: "--font-script", subsets: ["khmer"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
const SCRIPT_FONT: Partial<Record<Locale, string>> = { lo: lao.variable, my: myanmar.variable, km: khmer.variable };

// Every language is prerendered. Cache Components has no `dynamicParams = false`; the proxy only
// rewrites to supported languages, and the layout below 404s anything else.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

// This layout must know the language before anything renders (`<html lang>`, the script font), so
// it cannot offer a language-less App Shell. Entering it from another language is always a full page
// load anyway (the switcher reloads). `false` lets it block there; navigations between pages of
// one language are still validated in development, and `next build` still enforces static shells.
export const instant = false;

/** The back office: never indexed, named after the brand plus "back office" in the page's language. */
export async function generateMetadata(): Promise<Metadata> {
  const lang = await rootLang();
  if (!isLocale(lang)) return {};
  const t = await loadDict(lang);
  const name = `${t.common.brand} ${t.console.heading}`;
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    robots: { index: false, follow: false },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "white",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const lang = await rootLang();
  if (!isLocale(lang)) notFound();
  const [t, theme] = await Promise.all([loadDict(lang), getThemeId()]);
  // Client Components get the shared namespaces; the back-office pages and the sign-in page add their own.
  const clientDict = { common: t.common, lotto: t.lotto, site: t.site };
  return (
    <html lang={LOCALE_META[lang].htmlLang} data-theme={theme} className={`${plex.variable} ${SCRIPT_FONT[lang] ?? ""} antialiased`}>
      <body className="bg-canvas text-ink">
        <ArtDefs />
        <I18nProvider lang={lang} t={clientDict}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

"use client";

import { Check, Globe } from "lucide-react";
import { useId } from "react";
import { useI18n } from "@/i18n/client";
import { LOCALES, LOCALE_COOKIE, LOCALE_META, stripLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

/**
 * The choice is a cookie; loading the same (unprefixed) URL again renders every server and client
 * part in the new language. It has to be a full page load, not a client navigation: the language
 * is the root layout's param, so `<html lang>` and every cached segment of the old language must go.
 */
function switchLanguage(next: Locale) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${365 * 86_400}; samesite=lax${secure}`;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load is the point (see above)
  window.location.assign(`${stripLocale(window.location.pathname)}${window.location.search}`);
}

/** Pick the site language. `compact`: globe only on phones, where the header has no room for the code. */
export function LanguageSwitcher({
  className,
  tone = "light",
  align = "end",
  compact = false,
}: {
  className?: string;
  tone?: "light" | "dark";
  align?: "start" | "end";
  compact?: boolean;
}) {
  const { lang, t } = useI18n();
  const id = useId().replace(/:/g, "");
  return (
    <>
      <button
        type="button"
        popoverTarget={`lang-${id}`}
        aria-label={t.common.language.choose}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-control px-2 text-sm font-medium",
          tone === "dark" ? "text-on-deep-2 hover:bg-white/10 hover:text-white" : "text-ink-2 hover:bg-panel hover:text-ink",
          className,
        )}
      >
        <Globe className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{LOCALE_META[lang].native}</span>
        {!compact && <span className="sm:hidden">{lang.toUpperCase()}</span>}
      </button>
      <div
        id={`lang-${id}`}
        popover="auto"
        className={cn("fixed inset-auto top-14 m-0 w-52 rounded-card border border-line bg-surface p-1.5 text-ink shadow-float", align === "end" ? "right-4" : "left-4")}
      >
        <p className="px-3 pt-1.5 pb-1 text-xs text-ink-3">{t.common.language.title}</p>
        <ul>
          {LOCALES.map((l) => (
            <li key={l}>
              <button
                type="button"
                lang={LOCALE_META[l].htmlLang}
                onClick={() => (l === lang ? document.getElementById(`lang-${id}`)?.hidePopover() : switchLanguage(l))}
                aria-current={l === lang ? "true" : undefined}
                className="flex h-10 w-full items-center gap-2.5 rounded-control px-3 text-left text-sm hover:bg-panel"
              >
                <span className="flex-1">
                  {LOCALE_META[l].native}
                  {l !== "en" && <span className="ml-1.5 text-xs text-ink-3">{LOCALE_META[l].english}</span>}
                </span>
                {l === lang && <Check className="size-4 text-brand" strokeWidth={2.5} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

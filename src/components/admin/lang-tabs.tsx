"use client";

import { LOCALES, LOCALE_META, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

/** Pick which language of a piece of content to edit. Thai is the main text; the others are optional. */
export function LangTabs({ value, onChange, label }: { value: Locale; onChange: (l: Locale) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto rounded-control bg-panel p-1">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          aria-selected={value === l}
          lang={LOCALE_META[l].htmlLang}
          onClick={() => onChange(l)}
          className={cn("h-8 shrink-0 rounded-[8px] px-3 text-sm font-medium", value === l ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}
        >
          {LOCALE_META[l].native}
        </button>
      ))}
    </div>
  );
}

export type Translations<K extends string> = Partial<Record<Exclude<Locale, "th">, Partial<Record<K, string>>>>;

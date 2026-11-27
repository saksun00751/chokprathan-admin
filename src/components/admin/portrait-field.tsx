"use client";

import { PORTRAITS, type Avatar } from "@/domain/avatar";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { initial } from "./initial";
import { StaffAvatar } from "./staff-avatar";

/** Choose a portrait, or null for the first letter of the name. Used on /profile and when adding staff. */
export function PortraitField({ value, name, disabled, onChange }: { value: Avatar | null; name: string; disabled?: boolean; onChange: (next: Avatar | null) => void }) {
  const pf = useI18n().t.admin.people.profile;
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value === null}
          aria-label={pf.useLetter}
          onClick={() => onChange(null)}
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full border-2 text-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value === null ? "border-brand bg-brand-soft" : "border-line hover:bg-panel",
          )}
        >
          {initial(name) ?? "-"}
        </button>
        <span className="text-sm text-ink-2" aria-hidden="true">
          {pf.useLetter}
        </span>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-xs text-ink-3">{pf.groups.staff}</legend>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
          {PORTRAITS.map((p, i) => {
            const label = fmt(p.gender === "male" ? pf.portraitMale : pf.portraitFemale, { n: PORTRAITS.slice(0, i + 1).filter((o) => o.gender === p.gender).length });
            const on = value === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                aria-label={label}
                title={label}
                onClick={() => onChange(p.id)}
                className={cn(
                  "aspect-square w-full max-w-18 overflow-hidden rounded-full border-2 p-0.5 transition-transform disabled:cursor-not-allowed disabled:opacity-50",
                  on ? "border-brand ring-2 ring-brand/30" : "border-transparent hover:scale-105",
                )}
              >
                <StaffAvatar id={p.id} className="size-full rounded-full" />
              </button>
            );
          })}
        </div>
      </fieldset>
    </>
  );
}

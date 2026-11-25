"use client";

import type { Schedule } from "chokprathan-core/rules/types";
import { useI18n } from "@/i18n/client";
import type { Dict } from "@/i18n/dictionaries";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/cn";

/** A schedule in one line. */
export function scheduleText(s: Schedule, t: Dict) {
  const lo = t.admin.ops.lottos;
  const opens = s.opens ? ` · ${fmt(lo.opensShort, { time: s.opens })}` : "";
  if (s.kind === "interval") return fmt(lo.interval, { every: s.everyMin, count: s.count, first: s.firstClose }) + opens;
  if (s.kind === "monthly") return fmt(lo.monthly, { days: s.days.join(", "), close: s.close }) + opens;
  return fmt(lo.weekly, { days: s.days.length === 7 ? lo.everyDay : s.days.map((d) => t.lotto.weekdays[d]).join(" "), close: s.close }) + opens;
}

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** The draw schedule inputs, shared by the edit and add forms of a lottery. */
export function ScheduleFields({ schedule, onChange, note }: { schedule: Schedule; onChange: (s: Schedule) => void; note?: string }) {
  const { t } = useI18n();
  const lo = t.admin.ops.lottos;
  return (
    <fieldset className="rounded-control bg-panel p-4">
      <legend className="sr-only">{lo.schedule}</legend>
      <p className="mb-3 text-sm font-semibold">{lo.schedule}</p>
      {schedule.kind === "interval" ? (
        <div className="flex flex-wrap gap-3">
          <TextField label={lo.firstClose} value={schedule.firstClose} onChange={(v) => onChange({ ...schedule, firstClose: v })} type="time" />
          <NumberField label={lo.everyMin} value={schedule.everyMin} onChange={(v) => onChange({ ...schedule, everyMin: v })} />
          <NumberField label={lo.count} value={schedule.count} onChange={(v) => onChange({ ...schedule, count: v })} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {(["weekly", "monthly"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() =>
                  onChange(kind === "weekly" ? { kind, days: [1, 2, 3, 4, 5], close: schedule.close, opens: schedule.opens } : { kind, days: [1, 16], close: schedule.close, opens: schedule.opens })
                }
                className={cn("h-9 rounded-full px-3 font-medium", schedule.kind === kind ? "bg-ink text-white" : "bg-surface text-ink-2")}
              >
                {kind === "weekly" ? lo.byWeekday : lo.byMonthDay}
              </button>
            ))}
          </div>
          {schedule.kind === "weekly" ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={lo.drawDays}>
              {t.lotto.weekdays.map((label, d) => {
                const on = schedule.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...schedule, days: on ? schedule.days.filter((x) => x !== d) : [...schedule.days, d].sort() })}
                    className={cn("h-9 w-11 rounded-control text-sm font-semibold", on ? "bg-brand text-white" : "bg-surface text-ink-2")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid max-w-sm grid-cols-7 gap-1.5" role="group" aria-label={lo.drawDays}>
              {MONTH_DAYS.map((d) => {
                const on = schedule.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...schedule, days: on ? schedule.days.filter((x) => x !== d) : [...schedule.days, d].sort((x, y) => x - y) })}
                    className={cn("tnum h-9 rounded-control text-sm font-semibold", on ? "bg-brand text-white" : "bg-surface text-ink-2")}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
          <TextField label={lo.closeTime} value={schedule.close} onChange={(v) => onChange({ ...schedule, close: v })} type="time" />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={schedule.opens !== undefined}
            onChange={(e) => onChange(e.target.checked ? { ...schedule, opens: "00:00" } : { ...schedule, opens: undefined })}
            className="size-4 accent-[var(--color-brand)]"
          />
          {lo.opensCustom}
        </label>
        {schedule.opens !== undefined && <TextField label={lo.opensTime} value={schedule.opens} onChange={(v) => onChange({ ...schedule, opens: v })} type="time" />}
      </div>
      <p className="mt-1 text-xs text-ink-3">{lo.opensNote}</p>
      {note && <p className="mt-3 text-xs text-ink-3">{note}</p>}
    </fieldset>
  );
}

export function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-ink-3">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-control border border-line-strong bg-surface px-3" />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-ink-3">{label}</span>
      <input
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
        className="tnum h-10 w-28 rounded-control border border-line-strong bg-surface px-3 text-right"
      />
    </label>
  );
}

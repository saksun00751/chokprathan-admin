"use client";

import { useI18n } from "@/i18n/client";
import type { Dict } from "@/i18n/dictionaries";
import { fmt, formatNumber } from "@/i18n/format";
import { useState, useTransition } from "react";
import { betTypesFor } from "@/domain/betTypes";
import { formatRate } from "@/domain/money";
import type { BetTypeCode, RiskProfile, Schedule } from "@/domain/types";
import { Badge } from "@/components/ui/primitives";
import { useConfirm } from "@/components/admin/confirm";
import { changedRows } from "@/domain/confirm";
import { Button } from "@/components/ui/button";
import { Flag } from "@/components/ui/flag";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { saveLottoAction } from "@/server/actions/admin";
import type { Lotto } from "@/server/services/lottos";
import { TierEditor } from "./tier-editor";

function scheduleText(s: Schedule, t: Dict) {
  const lo = t.admin.ops.lottos;
  const opens = s.opens ? ` · ${fmt(lo.opensShort, { time: s.opens })}` : "";
  if (s.kind === "interval") return fmt(lo.interval, { every: s.everyMin, count: s.count, first: s.firstClose }) + opens;
  if (s.kind === "monthly") return fmt(lo.monthly, { days: s.days.join(", "), close: s.close }) + opens;
  return fmt(lo.weekly, { days: s.days.length === 7 ? lo.everyDay : s.days.map((d) => t.lotto.weekdays[d]).join(" "), close: s.close }) + opens;
}

export function LottoList({ lottos, rates, risk }: { lottos: Lotto[]; rates: Record<BetTypeCode, number>; risk: Record<BetTypeCode, RiskProfile> }) {
  const { t } = useI18n();
  const lo = t.admin.ops.lottos;
  return (
    <ul className="flex flex-col gap-2">
      {lottos.map((l) => (
        <li key={l.id}>
          <details className="group rounded-card border border-line bg-surface shadow-card open:shadow-float">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
              <Flag code={l.flag} className="size-7" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{l.name}</span>
                <span className="block text-xs text-ink-3">
                  {t.lotto.groups[l.group]} · {scheduleText(l.schedule, t)}
                </span>
              </span>
              {!l.enabled && <Badge tone="outline">{lo.off}</Badge>}
              {l.autoResult ? <Badge tone="brand">{lo.autoResult}</Badge> : <Badge>{lo.manualResult}</Badge>}
              {Object.keys(l.risk).length > 0 && <Badge tone="warning">{lo.customRisk}</Badge>}
              <span className="text-sm font-semibold text-brand group-open:hidden">{lo.edit}</span>
            </summary>
            <LottoForm lotto={l} rates={rates} risk={risk} />
          </details>
        </li>
      ))}
    </ul>
  );
}

function LottoForm({ lotto, rates, risk }: { lotto: Lotto; rates: Record<BetTypeCode, number>; risk: Record<BetTypeCode, RiskProfile> }) {
  const { t } = useI18n();
  const lo = t.admin.ops.lottos;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  // What was last saved: the confirmation lists the differences from it.
  const [saved, setSaved] = useState({
    name: lotto.name,
    shortName: lotto.shortName,
    enabled: lotto.enabled,
    autoResult: lotto.autoResult,
    resultDelayMin: lotto.resultDelayMin,
    schedule: lotto.schedule,
    rates: lotto.rates as Partial<Record<BetTypeCode, number>>,
    risk: lotto.risk,
  });
  const [name, setName] = useState(lotto.name);
  const [shortName, setShortName] = useState(lotto.shortName);
  const [enabled, setEnabled] = useState(lotto.enabled);
  const [autoResult, setAutoResult] = useState(lotto.autoResult);
  const [delay, setDelay] = useState(lotto.resultDelayMin);
  const [schedule, setSchedule] = useState<Schedule>(lotto.schedule);
  const [rateText, setRateText] = useState<Partial<Record<BetTypeCode, string>>>(() =>
    Object.fromEntries(Object.entries(lotto.rates).map(([k, v]) => [k, formatRate(v as number)])),
  );
  const [customRisk, setCustomRisk] = useState<Partial<Record<BetTypeCode, RiskProfile>>>(lotto.risk);
  const codes = betTypesFor(lotto.format);

  return (
    <form
      className="flex flex-col gap-5 border-t border-line p-4 sm:p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const overrideRates: Partial<Record<BetTypeCode, number>> = Object.fromEntries(
          Object.entries(rateText)
            .filter(([, v]) => v && parseFloat(v) > 0)
            .map(([code, v]) => [code, Math.round(parseFloat(v!) * 100)]),
        );
        const onOff = (b: boolean) => (b ? t.common.on : t.common.off);
        const tierLabel = (c: BetTypeCode) => `${t.lotto.betTypes[c].label} · ${lo.customTiers}`;
        const tierRows = new Set(codes.map(tierLabel));
        const rows = changedRows<string>([
          { label: lo.name, before: saved.name, after: name },
          { label: lo.shortName, before: saved.shortName, after: shortName },
          { label: lo.enabled, before: onOff(saved.enabled), after: onOff(enabled) },
          { label: lo.autoResult, before: onOff(saved.autoResult), after: onOff(autoResult) },
          { label: lo.delay, before: String(saved.resultDelayMin), after: String(delay) },
          { label: lo.schedule, before: scheduleText(saved.schedule, t), after: scheduleText(schedule, t) },
          ...codes.flatMap((c) => [
            // The rate members actually get: this lotto's own rate, or the default when blank.
            {
              label: `${t.lotto.betTypes[c].label} · ${lo.pays}`,
              before: `×${formatRate(saved.rates[c] ?? rates[c])}`,
              after: `×${formatRate(overrideRates[c] ?? rates[c])}`,
            },
            { label: tierLabel(c), before: JSON.stringify(saved.risk[c] ?? null), after: JSON.stringify(customRisk[c] ?? null) },
          ]),
        ]);
        if (rows.length === 0) {
          toast.info(k.noChanges);
          return;
        }
        const answer = await ask({
          title: k.saveLotto,
          tone: saved.enabled && !enabled ? "danger" : "default",
          // Name the lotto first, unless its name is one of the changes listed anyway.
          details: [
            ...(rows.some((r) => r.label === lo.shortName) ? [] : ([[lo.shortName, shortName]] as [string, string][])),
            ...rows.map((r): [string, string] => [r.label, tierRows.has(r.label) ? k.changed : `${r.before} → ${r.after}`]),
          ],
          note: k.saveRiskNote,
        });
        if (!answer.ok) return;
        const next = { name, shortName, enabled, autoResult, resultDelayMin: delay, schedule, rates: overrideRates, risk: customRisk };
        start(async () => {
          const r = await saveLottoAction(lotto.id, next);
          if (r.ok) {
            toast.success(r.message ?? lo.saved);
            setSaved(next);
          } else toast.error(r.error);
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label={lo.name} value={name} onChange={setName} />
        <TextField label={lo.shortName} value={shortName} onChange={setShortName} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{lo.delay}</span>
          <input
            inputMode="numeric"
            value={String(delay)}
            onChange={(e) => setDelay(Number(e.target.value.replace(/\D/g, "")) || 0)}
            className="tnum h-10 rounded-control border border-line-strong px-3 text-right"
          />
        </label>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />{" "}
            {lo.enabled}
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={autoResult} onChange={(e) => setAutoResult(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />{" "}
            {lo.autoResult}
          </label>
        </div>
      </div>

      <fieldset className="rounded-control bg-panel p-4">
        <legend className="sr-only">{lo.schedule}</legend>
        <p className="mb-3 text-sm font-semibold">{lo.schedule}</p>
        {schedule.kind === "interval" ? (
          <div className="flex flex-wrap gap-3">
            <TextField label={lo.firstClose} value={schedule.firstClose} onChange={(v) => setSchedule({ ...schedule, firstClose: v })} type="time" />
            <NumberField label={lo.everyMin} value={schedule.everyMin} onChange={(v) => setSchedule({ ...schedule, everyMin: v })} />
            <NumberField label={lo.count} value={schedule.count} onChange={(v) => setSchedule({ ...schedule, count: v })} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 text-sm">
              {(["weekly", "monthly"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() =>
                    setSchedule(kind === "weekly" ? { kind, days: [1, 2, 3, 4, 5], close: schedule.close, opens: schedule.opens } : { kind, days: [1, 16], close: schedule.close, opens: schedule.opens })
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
                      onClick={() => setSchedule({ ...schedule, days: on ? schedule.days.filter((x) => x !== d) : [...schedule.days, d].sort() })}
                      className={cn("h-9 w-11 rounded-control text-sm font-semibold", on ? "bg-brand text-white" : "bg-surface text-ink-2")}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <TextField
                label={lo.monthDays}
                value={schedule.days.join(",")}
                onChange={(v) =>
                  setSchedule({
                    ...schedule,
                    days: v
                      .split(",")
                      .map((x) => Number(x.trim()))
                      .filter((n) => n >= 1 && n <= 31),
                  })
                }
              />
            )}
            <TextField label={lo.closeTime} value={schedule.close} onChange={(v) => setSchedule({ ...schedule, close: v })} type="time" />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={schedule.opens !== undefined}
              onChange={(e) => setSchedule(e.target.checked ? { ...schedule, opens: "00:00" } : { ...schedule, opens: undefined })}
              className="size-4 accent-[var(--color-brand)]"
            />
            {lo.opensCustom}
          </label>
          {schedule.opens !== undefined && <TextField label={lo.opensTime} value={schedule.opens} onChange={(v) => setSchedule({ ...schedule, opens: v })} type="time" />}
        </div>
        <p className="mt-1 text-xs text-ink-3">{lo.opensNote}</p>
        <p className="mt-3 text-xs text-ink-3">{lo.scheduleNote}</p>
      </fieldset>

      <div>
        <p className="mb-2 text-sm font-semibold">{lo.ratesTitle}</p>
        <ul className="flex flex-col gap-3">
          {codes.map((code) => {
            const base = rateText[code] && parseFloat(rateText[code]!) > 0 ? Math.round(parseFloat(rateText[code]!) * 100) : rates[code];
            const custom = customRisk[code];
            return (
              <li key={code} className="grid grid-cols-1 gap-3 rounded-control border border-line p-3 md:grid-cols-[200px_minmax(0,1fr)]">
                <div>
                  <p className="text-sm font-semibold">{t.lotto.betTypes[code].label}</p>
                  <label className="mt-1.5 flex items-center gap-2 text-sm">
                    <span className="text-xs text-ink-3">{lo.pays}</span>
                    <input
                      value={rateText[code] ?? ""}
                      placeholder={formatRate(rates[code])}
                      inputMode="decimal"
                      onChange={(e) => setRateText({ ...rateText, [code]: e.target.value.replace(/[^\d.]/g, "") })}
                      className="tnum h-9 w-24 rounded-[8px] border border-line-strong px-2 text-right placeholder:text-ink-3"
                    />
                  </label>
                  <p className="mt-1 text-xs text-ink-3">{fmt(lo.useDefault, { rate: formatRate(rates[code]) })}</p>
                </div>
                <div>
                  <label className="mb-2 inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!custom}
                      onChange={(e) => {
                        const next = { ...customRisk };
                        if (e.target.checked) next[code] = structuredClone(risk[code]);
                        else delete next[code];
                        setCustomRisk(next);
                      }}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    {lo.customTiers}
                  </label>
                  {custom ? (
                    <TierEditor profile={custom} baseRate100={base} onChange={(p) => setCustomRisk({ ...customRisk, [code]: p })} betType={code} />
                  ) : (
                    <p className="text-xs text-ink-3">
                      {lo.defaultTiers}{" "}
                      {risk[code].enabled
                        ? `${risk[code].tiers.map((x) => `฿${formatNumber(x.threshold)}→${x.percent}%`).join(", ")}${risk[code].cap !== null ? fmt(lo.capAt, { amount: formatNumber(risk[code].cap!) }) : ""}`
                        : lo.noCut}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {fmt(lo.save, { name: shortName })}
        </Button>
      </div>
    </form>
  );
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
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

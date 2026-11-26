"use client";

import { Plus, X } from "lucide-react";
import { formatRate } from "@/core/rules/money";
import { validateProfile } from "@/core/rules/pricing";
import type { BetTypeCode, RiskProfile } from "@/core/rules/types";
import { useI18n } from "@/i18n/client";
import { fmt, formatNumber } from "@/i18n/format";
import { explainProfile, percentRate100, type ExplainRow } from "./risk-explain";

const num = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

/**
 * Edit one risk profile: tiers of (total stake → % of base rate) plus a closing cap, with a live
 * plain-language summary underneath. `betType` only picks the digits of the example number.
 */
export function TierEditor({
  profile,
  baseRate100,
  onChange,
  betType,
}: {
  profile: RiskProfile;
  baseRate100: number;
  onChange: (p: RiskProfile) => void;
  betType?: BetTypeCode;
}) {
  const tr = useI18n().t.admin.ops.tiers;
  const errors = validateProfile(profile, tr.problems);
  const setTier = (i: number, patch: Partial<RiskProfile["tiers"][number]>) =>
    onChange({ ...profile, tiers: profile.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={profile.enabled} onChange={(e) => onChange({ ...profile, enabled: e.target.checked })} className="size-4 accent-[var(--color-brand)]" />
        {tr.auto}
      </label>
      {profile.enabled && (
        <>
          <ul className="flex flex-col gap-1.5">
            {profile.tiers.map((t, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink-3">{tr.whenTotal}</span>
                <input
                  inputMode="numeric"
                  value={String(t.threshold)}
                  onChange={(e) => setTier(i, { threshold: num(e.target.value) })}
                  aria-label={fmt(tr.thresholdLabel, { n: i + 1 })}
                  className="tnum h-9 w-24 rounded-[8px] border border-line-strong px-2 text-right"
                />
                <span className="text-ink-3">{tr.bahtPays}</span>
                <input
                  inputMode="numeric"
                  value={String(t.percent)}
                  onChange={(e) => setTier(i, { percent: num(e.target.value) })}
                  aria-label={fmt(tr.percentLabel, { n: i + 1 })}
                  className="tnum h-9 w-16 rounded-[8px] border border-line-strong px-2 text-right"
                />
                <span className="text-ink-3">{tr.ofBase}</span>
                <span aria-hidden="true" className="text-ink-3">
                  ⇒
                </span>
                <span className="tnum rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
                  {fmt(tr.payEach, { rate: formatRate(percentRate100(baseRate100, t.percent)) })}
                </span>
                <button type="button" onClick={() => onChange({ ...profile, tiers: profile.tiers.filter((_, j) => j !== i) })} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-danger-soft hover:text-danger" aria-label={fmt(tr.removeLabel, { n: i + 1 })}>
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {profile.tiers.length < 6 && (
              <button
                type="button"
                onClick={() => {
                  const last = profile.tiers.at(-1);
                  onChange({ ...profile, tiers: [...profile.tiers, { threshold: (last?.threshold ?? 0) + 2000, percent: Math.max(1, (last?.percent ?? 100) - 25) }] });
                }}
                className="inline-flex h-9 items-center gap-1 rounded-[8px] px-2 font-medium text-brand hover:bg-brand-soft"
              >
                <Plus className="size-4" aria-hidden="true" /> {tr.addStep}
              </button>
            )}
            <span className="ml-auto text-ink-3">{tr.closeAt}</span>
            <input
              inputMode="numeric"
              value={profile.cap === null ? "" : String(profile.cap)}
              placeholder={tr.noClose}
              onChange={(e) => onChange({ ...profile, cap: e.target.value.trim() === "" ? null : num(e.target.value) })}
              aria-label={tr.capLabel}
              className="tnum h-9 w-28 rounded-[8px] border border-line-strong px-2 text-right placeholder:text-ink-3"
            />
            <span className="text-ink-3">{tr.baht}</span>
          </div>
          {errors.length > 0 && <p className="text-sm text-danger">{errors[0]}</p>}
        </>
      )}
      <Explain profile={profile} baseRate100={baseRate100} betType={betType} />
    </div>
  );
}

/** "สรุปการทำงาน": what the current values do, worded from the same numbers the pricing uses. */
function Explain({ profile, baseRate100, betType }: { profile: RiskProfile; baseRate100: number; betType?: BetTypeCode }) {
  const tr = useI18n().t.admin.ops.tiers;
  const { rows, example } = explainProfile(profile, baseRate100, betType);
  const line = (r: ExplainRow) => {
    switch (r.kind) {
      case "off":
        return fmt(tr.explainOff, { rate: formatRate(r.rate100) });
      case "flat":
        return fmt(tr.explainFlat, { rate: formatRate(r.rate100) });
      case "start":
        return fmt(tr.explainStart, { to: formatNumber(r.to), rate: formatRate(r.rate100) });
      case "tier":
        return fmt(tr.explainTier, { from: formatNumber(r.from), rate: formatRate(r.rate100), percent: r.percent });
      case "close":
        return fmt(tr.explainClose, { from: formatNumber(r.from) });
    }
  };
  return (
    <section aria-label={tr.explainTitle} className="mt-1 rounded-[8px] bg-panel px-3 py-2 text-xs text-ink-2">
      <h4 className="font-semibold text-ink">{tr.explainTitle}</h4>
      <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
        {rows.map((r, i) => (
          <li key={i} className="tnum break-words">
            {line(r)}
          </li>
        ))}
      </ul>
      {example && (
        <p className="tnum mt-1.5 break-words text-ink-3">
          {example.kind === "rate"
            ? fmt(tr.explainExample, { sample: example.sample, total: formatNumber(example.total), rate: formatRate(example.rate100) })
            : fmt(tr.explainExampleClosed, { sample: example.sample, total: formatNumber(example.total) })}
        </p>
      )}
    </section>
  );
}

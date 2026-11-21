"use client";

import { useI18n } from "@/i18n/client";
import { useState, useTransition } from "react";
import { BET_TYPE_ORDER } from "@/domain/betTypes";
import { formatRate } from "@/domain/money";
import { validateProfile } from "@/domain/pricing";
import type { BetTypeCode, RiskProfile } from "@/domain/types";
import { useConfirm } from "@/components/admin/confirm";
import { changedRows } from "@/domain/confirm";
import { formatNumber } from "@/i18n/format";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { BetLimits } from "@/server/catalog";
import { saveRiskSettingsAction } from "@/server/actions/admin";
import { defaultsSummary, equalsDefaults, type CardValues } from "./risk-explain";
import { TierEditor } from "./tier-editor";

const toRate100 = (s: string) => Math.round(parseFloat(s) * 100);

type RiskSettings = { rates: Record<BetTypeCode, number>; risk: Record<BetTypeCode, RiskProfile>; limits: BetLimits };

export function RiskEditor({ rates, risk, limits, defaults }: RiskSettings & { defaults: RiskSettings }) {
  const { t } = useI18n();
  const rk = t.admin.ops.risk;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  // What was last saved: the confirmation lists the differences from it.
  const [saved, setSaved] = useState({ rates, risk, limits });
  const [rateText, setRateText] = useState<Record<BetTypeCode, string>>(
    () => Object.fromEntries(BET_TYPE_ORDER.map((c) => [c, formatRate(rates[c])])) as Record<BetTypeCode, string>,
  );
  const [profiles, setProfiles] = useState(risk);
  const [lim, setLim] = useState(limits);
  const defaultCard = (c: BetTypeCode): CardValues => ({ rate100: defaults.rates[c], maxPerNumber: defaults.limits.maxPerNumber[c], profile: defaults.risk[c] });
  /** Put one card back to the system defaults, locally: nothing is saved until the form is submitted. */
  const resetCard = (c: BetTypeCode) => {
    setRateText({ ...rateText, [c]: formatRate(defaults.rates[c]) });
    setLim({ ...lim, maxPerNumber: { ...lim.maxPerNumber, [c]: defaults.limits.maxPerNumber[c] } });
    setProfiles({ ...profiles, [c]: structuredClone(defaults.risk[c]) });
  };
  const invalid = BET_TYPE_ORDER.some((c) => validateProfile(profiles[c], t.admin.ops.tiers.problems).length > 0 || !(toRate100(rateText[c]) > 0));

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const nextRates = Object.fromEntries(BET_TYPE_ORDER.map((c) => [c, toRate100(rateText[c])])) as Record<BetTypeCode, number>;
        const tierLabel = (c: BetTypeCode) => `${t.lotto.betTypes[c].label} · ${t.admin.ops.tiers.auto}`;
        const tierRows = new Set(BET_TYPE_ORDER.map(tierLabel));
        const rows = changedRows<string>([
          { label: rk.minStake, before: formatNumber(saved.limits.minStake), after: formatNumber(lim.minStake) },
          { label: rk.maxPerBill, before: formatNumber(saved.limits.maxPerBill), after: formatNumber(lim.maxPerBill) },
          { label: rk.maxLines, before: formatNumber(saved.limits.maxLines), after: formatNumber(lim.maxLines) },
          ...BET_TYPE_ORDER.flatMap((c) => [
            { label: `${t.lotto.betTypes[c].label} · ${rk.perBaht}`, before: `×${formatRate(saved.rates[c])}`, after: `×${formatRate(nextRates[c])}` },
            {
              label: `${t.lotto.betTypes[c].label} · ${rk.maxPerNumber}`,
              before: formatNumber(saved.limits.maxPerNumber[c]),
              after: formatNumber(lim.maxPerNumber[c]),
            },
            { label: tierLabel(c), before: JSON.stringify(saved.risk[c]), after: JSON.stringify(profiles[c]) },
          ]),
        ]);
        if (rows.length === 0) {
          toast.info(k.noChanges);
          return;
        }
        const answer = await ask({
          title: k.saveRisk,
          details: rows.map((r): [string, string] => [r.label, tierRows.has(r.label) ? k.changed : `${r.before} → ${r.after}`]),
          note: k.saveRiskNote,
        });
        if (!answer.ok) return;
        const next = { rates: nextRates, limits: lim, risk: profiles };
        start(async () => {
          const r = await saveRiskSettingsAction(next);
          if (r.ok) {
            toast.success(r.message ?? rk.saved);
            setSaved(next);
          } else toast.error(r.error);
        });
      }}
    >
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="font-semibold">{rk.billLimits}</h2>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {(
            [
              ["minStake", rk.minStake],
              ["maxPerBill", rk.maxPerBill],
              ["maxLines", rk.maxLines],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-xs text-ink-3">{label}</span>
              <input
                inputMode="numeric"
                value={String(lim[k])}
                onChange={(e) => setLim({ ...lim, [k]: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                className="tnum h-10 w-40 rounded-control border border-line-strong px-3 text-right"
              />
            </label>
          ))}
        </div>
      </section>

      <ul className="flex flex-col gap-3">
        {BET_TYPE_ORDER.map((code) => {
          const isDefault = equalsDefaults({ rate100: toRate100(rateText[code]), maxPerNumber: lim.maxPerNumber[code], profile: profiles[code] }, defaultCard(code));
          return (
          <li key={code} className="grid grid-cols-1 gap-4 rounded-card border border-line bg-surface p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">{t.lotto.betTypes[code].label}</h3>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-ink-3">{rk.perBaht}</span>
                <input
                  value={rateText[code]}
                  inputMode="decimal"
                  onChange={(e) => setRateText({ ...rateText, [code]: e.target.value.replace(/[^\d.]/g, "") })}
                  className="tnum h-10 rounded-control border border-line-strong px-3 text-right font-semibold"
                  aria-describedby={`rate-help-${code}`}
                />
                <span id={`rate-help-${code}`} className="text-xs text-ink-3">
                  {rk.rateHelp}
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-ink-3">{rk.maxPerNumber}</span>
                <input
                  inputMode="numeric"
                  value={String(lim.maxPerNumber[code])}
                  onChange={(e) => setLim({ ...lim, maxPerNumber: { ...lim.maxPerNumber, [code]: Number(e.target.value.replace(/\D/g, "")) || 0 } })}
                  className="tnum h-10 rounded-control border border-line-strong px-3 text-right"
                  aria-describedby={`max-help-${code}`}
                />
                <span id={`max-help-${code}`} className="text-xs text-ink-3">
                  {rk.maxPerNumberHelp}
                </span>
              </label>
              <div className="flex flex-col items-start gap-1 border-t border-line pt-3">
                <p className="text-xs text-ink-3">
                  {rk.defaultsLabel}{" "}
                  <span className="tnum">
                    {defaultsSummary(defaultCard(code), { summary: rk.defaultsSummary, tiers: rk.defaultsTiers, close: rk.defaultsClose, off: rk.defaultsOff }, formatNumber)}
                  </span>
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => resetCard(code)}
                  disabled={isDefault}
                  title={isDefault ? rk.alreadyDefault : rk.resetHint}
                  aria-describedby={`reset-help-${code}`}
                >
                  {rk.resetDefaults}
                </Button>
                <span id={`reset-help-${code}`} className="text-xs text-ink-3">
                  {isDefault ? rk.alreadyDefault : rk.resetHint}
                </span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-ink-3">{rk.tierNote}</p>
              <TierEditor
                profile={profiles[code]}
                baseRate100={toRate100(rateText[code]) || 0}
                onChange={(p) => setProfiles({ ...profiles, [code]: p })}
                betType={code}
              />
            </div>
          </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-surface/95 px-4 py-3 lg:-mx-8 lg:px-8">
        {invalid && <p className="text-sm text-danger">{rk.fixFirst}</p>}
        <Button type="submit" size="lg" loading={pending} disabled={invalid}>
          {rk.save}
        </Button>
      </div>
    </form>
  );
}

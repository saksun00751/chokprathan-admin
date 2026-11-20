"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { CHANCE_TOTAL, returnShare, wheelAverage, type ActivitySettings, type WheelPrize } from "@/domain/activities";
import { changedRows, money } from "@/domain/confirm";
import type { PointRule } from "@/domain/points";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { saveActivitiesAction } from "@/server/actions/admin";

const box = "h-10 rounded-control border border-line-strong bg-surface px-3";
const baht = (satang: number) => String(satang / 100);
const toSatang = (v: string) => Math.round((Number(v.replace(/[^\d.]/g, "")) || 0) * 100);
const int = (v: string) => Math.round(Number(v.replace(/[^\d]/g, "")) || 0);
const pct = (chance: number) => String(chance / 100);
const toChance = (v: string) => Math.round((Number(v.replace(/[^\d.]/g, "")) || 0) * 100);

function Field({ label, value, onChange, suffix, wide }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs text-ink-3">{label}</span>
      <span className="flex items-center gap-2">
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={`${box} tnum w-full text-right`} />
        {suffix && <span className="shrink-0 text-xs text-ink-3">{suffix}</span>}
      </span>
    </label>
  );
}

/** Settings for the lucky wheel and the guessing game, with what they pay back shown live. */
export function ActivitiesForm({
  initial,
  pointRule,
  lottos,
}: {
  initial: ActivitySettings;
  pointRule: PointRule;
  lottos: { id: number; name: string; enabled: boolean }[];
}) {
  const { t } = useI18n();
  const ac = t.admin.content.activities;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(initial);
  const [w, setW] = useState(initial.wheel);
  const [g, setG] = useState(initial.guess);
  // Text as typed, so "0.5" can be typed; numbers are derived from it.
  const [rows, setRows] = useState(() => initial.wheel.prizes.map((p) => ({ amount: baht(p.amount), chance: pct(p.chance) })));
  const prizes: WheelPrize[] = rows.map((r) => ({ amount: toSatang(r.amount), chance: toChance(r.chance) }));
  const total = prizes.reduce((s, p) => s + p.chance, 0);
  const average = wheelAverage(prizes);
  const share = returnShare(average, w.cost, pointRule);
  const guessShare = returnShare(Math.round(g.prize / 100), g.cost, pointRule);
  const onOff = (b: boolean) => (b ? t.common.on : t.common.off);

  const save = async () => {
    const next: ActivitySettings = { wheel: { ...w, prizes }, guess: g };
    const rowsChanged = changedRows<string>([
      { label: `${ac.wheel} · ${ac.enabled}`, before: onOff(saved.wheel.enabled), after: onOff(next.wheel.enabled) },
      { label: `${ac.wheel} · ${ac.cost}`, before: String(saved.wheel.cost), after: String(next.wheel.cost) },
      { label: `${ac.wheel} · ${ac.dailyLimit}`, before: String(saved.wheel.dailyLimit), after: String(next.wheel.dailyLimit) },
      { label: `${ac.wheel} · ${ac.turnover}`, before: String(saved.wheel.turnoverX), after: String(next.wheel.turnoverX) },
      { label: `${ac.wheel} · ${ac.dailyBudget}`, before: money(saved.wheel.dailyBudget), after: money(next.wheel.dailyBudget) },
      {
        label: `${ac.wheel} · ${ac.prizes}`,
        before: saved.wheel.prizes.map((p) => `${money(p.amount)} ${pct(p.chance)}%`).join(", "),
        after: next.wheel.prizes.map((p) => `${money(p.amount)} ${pct(p.chance)}%`).join(", "),
      },
      { label: `${ac.guess} · ${ac.enabled}`, before: onOff(saved.guess.enabled), after: onOff(next.guess.enabled) },
      { label: `${ac.guess} · ${ac.cost}`, before: String(saved.guess.cost), after: String(next.guess.cost) },
      { label: `${ac.guess} · ${ac.prize}`, before: money(saved.guess.prize), after: money(next.guess.prize) },
      { label: `${ac.guess} · ${ac.maxPerRound}`, before: String(saved.guess.maxPerRound), after: String(next.guess.maxPerRound) },
      { label: `${ac.guess} · ${ac.roundBudget}`, before: money(saved.guess.roundBudget), after: money(next.guess.roundBudget) },
      { label: `${ac.guess} · ${ac.turnover}`, before: String(saved.guess.turnoverX), after: String(next.guess.turnoverX) },
      {
        label: `${ac.guess} · ${ac.lottos}`,
        before: saved.guess.lottoIds.map((id) => lottos.find((l) => l.id === id)?.name ?? id).join(", ") || "-",
        after: next.guess.lottoIds.map((id) => lottos.find((l) => l.id === id)?.name ?? id).join(", ") || "-",
      },
    ]);
    if (rowsChanged.length === 0) {
      toast.info(k.noChanges);
      return;
    }
    const answer = await ask({
      title: k.saveActivities,
      tone: (!saved.wheel.enabled && next.wheel.enabled) || (!saved.guess.enabled && next.guess.enabled) ? "danger" : "default",
      details: rowsChanged.map((r): [string, string] => [r.label, `${r.before} → ${r.after}`]),
      note: k.saveActivitiesNote,
    });
    if (!answer.ok) return;
    start(async () => {
      const r = await saveActivitiesAction(next);
      if (r.ok) {
        toast.success(r.message ?? t.admin.content.done);
        setSaved(next);
      } else toast.error(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{ac.wheel}</h2>
          <label className="inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={w.enabled}
              onChange={(e) => setW({ ...w, enabled: e.target.checked })}
              className="size-4 accent-[var(--color-brand)]"
            />
            {ac.enabled}
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label={ac.cost} value={String(w.cost)} onChange={(v) => setW({ ...w, cost: int(v) })} suffix={ac.pointsUnit} />
          <Field label={ac.dailyLimit} value={String(w.dailyLimit)} onChange={(v) => setW({ ...w, dailyLimit: int(v) })} suffix={ac.timesUnit} />
          <Field label={ac.turnover} value={String(w.turnoverX)} onChange={(v) => setW({ ...w, turnoverX: int(v) })} suffix="×" />
          <Field label={ac.dailyBudget} value={baht(w.dailyBudget)} onChange={(v) => setW({ ...w, dailyBudget: toSatang(v) })} suffix="฿" />
        </div>
        <p className="mt-1 text-xs text-ink-3">{ac.zeroHint}</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="py-1.5 pr-2 font-medium">{ac.slot}</th>
                <th className="py-1.5 pr-2 font-medium">{ac.amount}</th>
                <th className="py-1.5 pr-2 font-medium">{ac.chance}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="tnum py-1 pr-2 text-ink-3">{i + 1}</td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label={`${ac.amount} ${i + 1}`}
                      inputMode="decimal"
                      value={r.amount}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                      className={`${box} tnum w-32 text-right`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <span className="flex items-center gap-1.5">
                      <input
                        aria-label={`${ac.chance} ${i + 1}`}
                        inputMode="decimal"
                        value={r.chance}
                        onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, chance: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                        className={`${box} tnum w-24 text-right`}
                      />
                      %
                    </span>
                  </td>
                  <td className="py-1 text-right">
                    <Button
                      size="iconSm"
                      variant="ghost"
                      aria-label={fmt(ac.removeSlot, { n: i + 1 })}
                      disabled={rows.length <= 2}
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={rows.length >= 12} onClick={() => setRows([...rows, { amount: "0", chance: "0" }])}>
            <Plus className="size-4" aria-hidden="true" />
            {ac.addSlot}
          </Button>
          <span className={total === CHANCE_TOTAL ? "text-success" : "font-semibold text-danger"}>{fmt(ac.total, { pct: pct(total) })}</span>
        </div>
        <p className="mt-3 rounded-control bg-panel px-3 py-2 text-sm">
          {fmt(ac.average, { amount: money(average) })}
          {share !== null && ` · ${fmt(ac.share, { pct: (share * 100).toFixed(2) })}`}
        </p>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{ac.guess}</h2>
          <label className="inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={g.enabled}
              onChange={(e) => setG({ ...g, enabled: e.target.checked })}
              className="size-4 accent-[var(--color-brand)]"
            />
            {ac.enabled}
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field label={ac.cost} value={String(g.cost)} onChange={(v) => setG({ ...g, cost: int(v) })} suffix={ac.pointsUnit} />
          <Field label={ac.prize} value={baht(g.prize)} onChange={(v) => setG({ ...g, prize: toSatang(v) })} suffix="฿" />
          <Field label={ac.maxPerRound} value={String(g.maxPerRound)} onChange={(v) => setG({ ...g, maxPerRound: int(v) })} />
          <Field label={ac.roundBudget} value={baht(g.roundBudget)} onChange={(v) => setG({ ...g, roundBudget: toSatang(v) })} suffix="฿" />
          <Field label={ac.turnover} value={String(g.turnoverX)} onChange={(v) => setG({ ...g, turnoverX: int(v) })} suffix="×" />
        </div>
        <p className="mt-1 text-xs text-ink-3">{ac.budgetHint}</p>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">{ac.lottos}</legend>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {lottos.map((l) => (
              <label key={l.id} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={g.lottoIds.includes(l.id)}
                  onChange={(e) => setG({ ...g, lottoIds: e.target.checked ? [...g.lottoIds, l.id] : g.lottoIds.filter((x) => x !== l.id) })}
                  className="size-4 accent-[var(--color-brand)]"
                />
                <span className={l.enabled ? "" : "text-ink-3"}>{l.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-3 rounded-control bg-panel px-3 py-2 text-sm">
          {fmt(ac.guessAverage, { amount: money(Math.round(g.prize / 100)) })}
          {guessShare !== null && ` · ${fmt(ac.share, { pct: (guessShare * 100).toFixed(2) })}`}
        </p>
      </section>

      <div className="flex justify-end">
        <Button size="lg" loading={pending} onClick={save}>
          {ac.save}
        </Button>
      </div>
    </div>
  );
}

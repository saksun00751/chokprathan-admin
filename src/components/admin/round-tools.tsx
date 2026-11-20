"use client";

import { useI18n } from "@/i18n/client";
import { fmt, formatNumber } from "@/i18n/format";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { formatBaht, formatRate } from "@/domain/money";
import type { BetTypeCode, ManualLimit, ResultFormat } from "@/domain/types";
import { useConfirm } from "@/components/admin/confirm";
import { Digits, EMPTY_RESULT, resultInput, resultPairs, type ResultValues } from "@/components/admin/result-summary";
import { Button } from "@/components/ui/button";
import { RateChip } from "@/components/ui/rate-chip";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { cancelRoundAction, setManualLimitAction, setResultAction } from "@/server/actions/admin";
import type { ExposureRow } from "@/server/services/risk";

const digitInput =
  "tnum h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-center text-lg font-semibold tracking-[0.2em] focus-visible:border-brand";

export function ResultForm({ roundId, format, round }: { roundId: number; format: ResultFormat; /** lotto and round, e.g. "Lao 16 Nov" */ round: string }) {
  const { t } = useI18n();
  const rf = t.admin.ops.resultForm;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState<ResultValues>(EMPTY_RESULT);
  const set = (k: keyof typeof v, max: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.value.replace(/\D/g, "").slice(0, max) });

  const field = (k: keyof typeof v, label: string, max: number) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-ink-3">{label}</span>
      <input inputMode="numeric" value={v[k]} onChange={set(k, max)} maxLength={max} className={digitInput} />
    </label>
  );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const input = resultInput(format, v);
        const answer = await ask({
          title: k.saveResult,
          tone: "danger",
          details: [
            [k.round, round],
            ...resultPairs(format, v, rf).map(([label, digits]): [string, ReactNode] => [label, <Digits key={label}>{digits}</Digits>]),
          ],
          note: k.saveResultNote,
          confirmLabel: rf.submit,
        });
        if (!answer.ok) return;
        start(async () => {
          const r = await setResultAction(roundId, input);
          if (r.ok) toast.success(r.message ?? rf.saved);
          else toast.error(r.error);
        });
      }}
    >
      {format === "thai_gov" ? (
        <>
          {field("first6", rf.first6, 6)}
          <div className="grid grid-cols-2 gap-2">
            {field("f1", rf.front1, 3)}
            {field("f2", rf.front2, 3)}
            {field("b1", rf.back1, 3)}
            {field("b2", rf.back2, 3)}
          </div>
          {field("bottom2", rf.bottom2, 2)}
        </>
      ) : format === "laos4" ? (
        field("top4", rf.top4, 4)
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {field("top3", rf.top3, 3)}
          {field("bottom2", rf.bottom2, 2)}
        </div>
      )}
      <Button type="submit" loading={pending}>
        {rf.submit}
      </Button>
    </form>
  );
}

export function CancelRoundButton({ roundId, round }: { roundId: number; round: string }) {
  const { t } = useI18n();
  const rf = t.admin.ops.resultForm;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="dangerGhost"
      className="border border-danger/30"
      loading={pending}
      onClick={async () => {
        const answer = await ask({ title: k.cancelRound, tone: "danger", details: [[k.round, round]], note: k.cancelRoundNote, confirmLabel: rf.cancel });
        if (!answer.ok) return;
        start(async () => {
          const r = await cancelRoundAction(roundId);
          if (r.ok) toast.success(r.message ?? rf.cancelled);
          else toast.error(r.error);
        });
      }}
    >
      {rf.cancel}
    </Button>
  );
}

type Config = { code: BetTypeCode; label: string; short: string; digits: number; rate100: number };

export function ExposurePanel({
  roundId,
  rows,
  configs,
  manual,
  editable,
}: {
  roundId: number;
  rows: ExposureRow[];
  configs: Config[];
  manual: { betType: BetTypeCode; number: string; limit: ManualLimit }[];
  editable: boolean;
}) {
  const { t } = useI18n();
  const ex = t.admin.ops.exposure;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<BetTypeCode | "all">("all");
  const [form, setForm] = useState<{ betType: BetTypeCode; number: string; percent: string }>({
    betType: configs[0]?.code ?? "top3",
    number: "",
    percent: "50",
  });
  const list = useMemo(() => rows.filter((r) => filter === "all" || r.betType === filter), [rows, filter]);

  /** Every limit change (set, half, close, clear) is confirmed with the number and the rate it will pay. */
  const apply = async (betType: BetTypeCode, number: string, limit: ManualLimit | null) => {
    const conf = configs.find((c) => c.code === betType);
    const limitText =
      limit === null
        ? null
        : limit.kind === "closed"
          ? ex.closed
          : `${limit.percent}%${conf ? ` · ${fmt(ex.preview, { rate: formatRate(Math.floor((conf.rate100 * limit.percent) / 100)), base: formatRate(conf.rate100) })}` : ""}`;
    const answer = await ask({
      title: limit === null ? k.clearLimit : k.setLimit,
      tone: limit?.kind === "closed" ? "danger" : "default",
      details: [
        [ex.type, t.lotto.betTypes[betType].label],
        [ex.number, <Digits key="n">{number}</Digits>],
        ...(limitText ? ([[k.limit, limitText]] as [string, string][]) : []),
      ],
    });
    if (!answer.ok) return;
    start(async () => {
      const r = await setManualLimitAction(roundId, betType, number, limit);
      if (r.ok) toast.success(r.message ?? ex.saved);
      else toast.error(r.error);
    });
  };

  const cfg = configs.find((c) => c.code === form.betType);

  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const percent = Number(form.percent);
            apply(form.betType, form.number, percent >= 100 || !percent ? { kind: "closed" } : { kind: "percent", percent });
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{ex.type}</span>
            <select
              value={form.betType}
              onChange={(e) => setForm({ ...form, betType: e.target.value as BetTypeCode, number: "" })}
              className="h-10 rounded-control border border-line-strong bg-surface px-3"
            >
              {configs.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{ex.number}</span>
            <input
              inputMode="numeric"
              value={form.number}
              maxLength={cfg?.digits}
              onChange={(e) => setForm({ ...form, number: e.target.value.replace(/\D/g, "").slice(0, cfg?.digits ?? 4) })}
              className="tnum h-10 w-24 rounded-control border border-line-strong px-3 text-center font-semibold tracking-[0.15em]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{ex.percent}</span>
            <input
              inputMode="numeric"
              value={form.percent}
              onChange={(e) => setForm({ ...form, percent: e.target.value.replace(/\D/g, "").slice(0, 3) })}
              className="tnum h-10 w-24 rounded-control border border-line-strong px-3 text-right"
            />
          </label>
          <Button type="submit" size="sm" className="h-10" loading={pending} disabled={!cfg || form.number.length !== cfg.digits}>
            {ex.apply}
          </Button>
          {cfg && Number(form.percent) > 0 && Number(form.percent) < 100 && (
            <p className="w-full text-xs text-ink-3">
              {fmt(ex.preview, { rate: formatRate(Math.floor((cfg.rate100 * Number(form.percent)) / 100)), base: formatRate(cfg.rate100) })}
            </p>
          )}
        </form>
      )}

      {manual.length > 0 && (
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="mb-2 text-sm font-semibold">{ex.manual}</p>
          <ul className="flex flex-wrap gap-2">
            {manual.map((m) => (
              <li key={`${m.betType}:${m.number}`} className="flex items-center gap-2 rounded-full bg-panel py-1 pr-1 pl-3 text-sm">
                <span>
                  {t.lotto.betTypes[m.betType].short} <b className="tnum">{m.number}</b> {m.limit.kind === "closed" ? ex.closed : `${m.limit.percent}%`}
                </span>
                {editable && (
                  <button
                    type="button"
                    onClick={() => apply(m.betType, m.number, null)}
                    className="rounded-full px-2 py-0.5 text-xs font-semibold text-danger hover:bg-danger-soft"
                  >
                    {ex.clear}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...configs.map((c) => c.code)] as (BetTypeCode | "all")[]).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setFilter(code)}
            aria-pressed={filter === code}
            className={cn("h-8 rounded-full px-3 text-xs font-semibold", filter === code ? "bg-ink text-white" : "bg-panel text-ink-2 hover:bg-line")}
          >
            {code === "all" ? ex.allTypes : t.lotto.betTypes[code].short}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-panel text-left text-xs text-ink-3">
            <tr>
              <th className="px-3 py-2.5 font-medium">{ex.type}</th>
              <th className="px-3 py-2.5 font-medium">{ex.number}</th>
              <th className="px-3 py-2.5 text-right font-medium">{ex.total}</th>
              <th className="px-3 py-2.5 text-right font-medium">{ex.bills}</th>
              <th className="px-3 py-2.5 text-right font-medium">{ex.payout}</th>
              <th className="px-3 py-2.5 font-medium">{ex.rateNow}</th>
              {editable && <th className="px-3 py-2.5 text-right font-medium">{ex.manage}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((r) => (
              <tr key={`${r.betType}:${r.number}`}>
                <td className="px-3 py-2">{t.lotto.betTypes[r.betType].label}</td>
                <td className="tnum px-3 py-2 text-base font-semibold tracking-[0.08em]">{r.number}</td>
                <td className="tnum px-3 py-2 text-right">฿{formatNumber(r.total)}</td>
                <td className="tnum px-3 py-2 text-right">{r.bills}</td>
                <td className="tnum px-3 py-2 text-right font-semibold">฿{formatBaht(r.potential, { decimals: "auto" })}</td>
                <td className="px-3 py-2">
                  <RateChip baseRate100={r.baseRate100} rate100={r.rate100 === r.baseRate100 ? undefined : r.rate100} />
                </td>
                {editable && (
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => apply(r.betType, r.number, { kind: "percent", percent: 50 })}
                      className="rounded-control px-2 py-1 text-xs font-semibold text-warning hover:bg-warning-soft"
                    >
                      {ex.half}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => apply(r.betType, r.number, { kind: "closed" })}
                      className="rounded-control px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-soft"
                    >
                      {ex.close}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-3">
                  {ex.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

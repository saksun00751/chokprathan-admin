"use client";

import { useI18n } from "@/i18n/client";
import { fmt, formatDateTime, formatNumber } from "@/i18n/format";
import { useState, useTransition, type ReactNode } from "react";
import type { ResultFormat } from "@/core/rules/types";
import { useConfirm } from "@/components/admin/confirm";
import { Digits, EMPTY_RESULT, resultComplete, resultInput, resultPairs, type ResultValues } from "@/components/admin/result-summary";
import { Button } from "@/components/ui/button";
import { Flag } from "@/components/ui/flag";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { enterResultsBulkAction } from "@/server/actions/admin";

type Row = { id: number; lotto: string; shortName: string; flag: string | null; format: ResultFormat; label: string; closesAt: number; late: boolean; bills: number };
const cell =
  "tnum h-10 w-full min-w-0 rounded-control border border-line-strong bg-surface px-2 text-center text-base font-semibold tracking-[0.15em] focus-visible:border-brand";

/** Type the results of every waiting round, check them, then save the filled ones together. */
export function BulkResults({ rows }: { rows: Row[] }) {
  const { lang, t } = useI18n();
  const br = t.admin.ops.results;
  const toast = useToast();
  const ask = useConfirm();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<Record<number, ResultValues>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const get = (id: number) => values[id] ?? EMPTY_RESULT;
  const set = (id: number, key: keyof ResultValues, max: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((all) => ({ ...all, [id]: { ...get(id), [key]: e.target.value.replace(/\D/g, "").slice(0, max) } }));
  const ready = rows.filter((r) => resultComplete(r.format, get(r.id)));

  const input = (r: Row, key: keyof ResultValues, label: string, max: number) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-ink-3">{label}</span>
      <input
        inputMode="numeric"
        autoComplete="off"
        value={get(r.id)[key]}
        onChange={set(r.id, key, max)}
        maxLength={max}
        className={cell}
        aria-label={`${r.lotto} ${r.label} ${label}`}
      />
    </label>
  );

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (ready.length === 0) return toast.error(br.fillOne);
        const k = t.admin.shell.confirm;
        const answer = await ask({
          title: fmt(k.saveResults, { n: ready.length }),
          tone: "danger",
          details: ready.map((r): [string, ReactNode] => [
            `${r.shortName} ${r.label}`,
            <span key={r.id} className="flex flex-col gap-0.5">
              {resultPairs(r.format, get(r.id), br).map(([label, digits]) => (
                <span key={label} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-xs font-normal text-ink-3">{label}</span>
                  <Digits>{digits}</Digits>
                </span>
              ))}
            </span>,
          ]),
          note: k.saveResultNote,
          confirmLabel: fmt(br.submitN, { n: ready.length }),
        });
        if (!answer.ok) return;
        start(async () => {
          const r = await enterResultsBulkAction(ready.map((x) => ({ roundId: x.id, input: resultInput(x.format, get(x.id)) })));
          if (!r.ok) return toast.error(r.error);
          setErrors(Object.fromEntries(r.data.errors.map((x) => [x.roundId, x.error])));
          if (r.data.errors.length) toast.error(r.message ?? br.someFailed);
          else toast.success(r.message ?? br.saved);
          setValues((all) => Object.fromEntries(Object.entries(all).filter(([id]) => r.data.errors.some((x) => x.roundId === Number(id)))));
        });
      }}
      className="flex flex-col gap-4"
    >
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const filled = resultComplete(r.format, get(r.id));
          return (
            <li
              key={r.id}
              className={cn("rounded-card border bg-surface p-4 shadow-card", errors[r.id] ? "border-danger" : filled ? "border-brand/40" : "border-line")}
            >
              <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
                <div className="flex min-w-0 items-center gap-3">
                  <Flag code={r.flag} className="size-7 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {r.shortName} <span className="font-normal text-ink-2">{r.label}</span>
                      {r.late && <span className="ml-2 text-xs font-semibold text-danger">{t.admin.ops.confirmResult.late}</span>}
                    </p>
                    <p className="text-xs text-ink-3">{fmt(br.meta, { time: formatDateTime(r.closesAt, lang), n: formatNumber(r.bills) })}</p>
                  </div>
                </div>
                {r.format === "thai_gov" ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    <div className="col-span-3 sm:col-span-2">{input(r, "first6", br.first6, 6)}</div>
                    {input(r, "f1", br.front1, 3)}
                    {input(r, "f2", br.front2, 3)}
                    {input(r, "b1", br.back1, 3)}
                    {input(r, "b2", br.back2, 3)}
                    {input(r, "bottom2", br.bottom2, 2)}
                  </div>
                ) : r.format === "laos4" ? (
                  <div className="grid max-w-xs grid-cols-1 gap-2">{input(r, "top4", br.top4, 4)}</div>
                ) : (
                  <div className="grid max-w-sm grid-cols-2 gap-2">
                    {input(r, "top3", br.top3, 3)}
                    {input(r, "bottom2", br.bottom2, 2)}
                  </div>
                )}
              </div>
              {errors[r.id] && <p className="mt-2 text-sm text-danger">{errors[r.id]}</p>}
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <p className="flex-1 text-sm text-ink-2">{fmt(br.progress, { ready: ready.length, total: rows.length })}</p>
        <Button type="submit" loading={pending} disabled={ready.length === 0}>
          {ready.length > 0 ? fmt(br.submitN, { n: ready.length }) : br.submit}
        </Button>
      </div>
    </form>
  );
}

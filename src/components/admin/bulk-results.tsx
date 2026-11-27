"use client";

import { useI18n } from "@/i18n/client";
import { fmt, formatDateTime, formatNumber } from "@/i18n/format";
import { Search } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { formatBaht } from "@/core/rules/money";
import type { ResultFormat } from "@/core/rules/types";
import { useConfirm } from "@/components/admin/confirm";
import { Digits, EMPTY_RESULT, resultComplete, resultInput, resultPairs, type ResultValues } from "@/components/admin/result-summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Flag } from "@/components/ui/flag";
import { useToast } from "@/components/ui/toast";
import { BULK_RESULTS_MAX } from "@/domain/bulk-results";
import { byGroup, groupName, type LottoGroupInfo } from "@/domain/lotto-groups";
import { matchesLotto } from "@/domain/new-lotto";
import { cn } from "@/lib/cn";
import { previewResultsBulkAction, submitResultsBulkAction } from "@/server/actions/admin";

type Row = { id: number; lotto: string; shortName: string; thaiName: string; slug: string; group: string; flag: string | null; format: ResultFormat; label: string; closesAt: number; late: boolean; bills: number };
const cell =
  "tnum h-10 w-full min-w-0 rounded-control border border-line-strong bg-surface px-2 text-center text-base font-semibold tracking-[0.15em] focus-visible:border-brand";

/** Type the results of every waiting round, check what they pay, then pay the filled ones together. */
export function BulkResults({ rows, groups }: { rows: Row[]; groups: LottoGroupInfo[] }) {
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
  const [picked, setPicked] = useState("all");
  const [query, setQuery] = useState("");
  const sections = byGroup(rows, groups);
  const labelOf = (g: LottoGroupInfo) => groupName(g, lang, t.lotto.groups);
  // The picked group empties once its results are saved.
  const filter = sections.some((s) => s.group.code === picked) ? picked : "all";
  const matches = (r: Row) =>
    (filter === "all" || r.group === filter) &&
    (matchesLotto({ name: r.lotto, shortName: r.shortName, slug: r.slug }, query) || matchesLotto({ name: r.thaiName, shortName: r.thaiName, slug: r.slug }, query));
  const shown = new Set(rows.filter(matches).map((r) => r.id));
  /** Filled rounds the filter hides: they are still sent, so the confirmation says so. */
  const hiddenReady = ready.filter((r) => !shown.has(r.id)).length;
  const chips = [
    { id: "all", label: t.common.all, count: rows.length },
    ...sections.map((s) => ({ id: s.group.code, label: labelOf(s.group), count: s.lottos.length })),
  ];

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

  const row = (r: Row) => {
    const filled = resultComplete(r.format, get(r.id));
    return (
      // Hidden rather than removed, so what was typed stays.
      <li
        key={r.id}
        hidden={!shown.has(r.id)}
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
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready.length === 0) return void toast.error(br.fillOne);
        if (ready.length > BULK_RESULTS_MAX) return void toast.error(fmt(br.tooMany, { max: BULK_RESULTS_MAX }));
        const c = t.admin.ops.confirmResult;
        const items = ready.map((x) => ({ roundId: x.id, input: resultInput(x.format, get(x.id)) }));
        start(async () => {
          const checked = await previewResultsBulkAction(items);
          if (!checked.ok) return void toast.error(checked.error);
          const { previews, errors: refused } = checked.data;
          setErrors(Object.fromEntries(refused.map((x) => [x.roundId, x.error])));
          if (previews.length === 0) return void toast.error(br.someFailed);
          const byId = new Map(previews.map((p) => [p.roundId, p]));
          const payable = ready.filter((r) => byId.has(r.id));
          const total = previews.reduce((s, p) => s + p.payout, 0);
          const answer = await ask({
            title: fmt(t.admin.shell.confirm.saveResults, { n: payable.length }),
            tone: "danger",
            details: payable.map((r): [string, ReactNode] => {
              const { winners, bills, payout } = byId.get(r.id)!;
              return [
                `${r.shortName} ${r.label}`,
                <span key={r.id} className="flex flex-col gap-0.5">
                  {resultPairs(r.format, get(r.id), br).map(([label, digits]) => (
                    <span key={label} className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-xs font-normal text-ink-3">{label}</span>
                      <Digits>{digits}</Digits>
                    </span>
                  ))}
                  <span className="text-xs font-normal text-ink-2">
                    {fmt(c.preview, { winners: formatNumber(winners), bills: formatNumber(bills), payout: formatBaht(payout, { decimals: "auto" }) })}
                  </span>
                </span>,
              ];
            }),
            note: [fmt(br.total, { payout: formatBaht(total, { decimals: "auto" }) }), hiddenReady > 0 && fmt(br.hidden, { n: hiddenReady }), c.confirmNote].filter(Boolean).join(" · "),
            confirmLabel: fmt(br.submitN, { n: payable.length }),
          });
          if (!answer.ok) return;
          start(async () => {
            const r = await submitResultsBulkAction(items.filter((x) => byId.has(x.roundId)));
            if (!r.ok) return void toast.error(r.error);
            const failed = [...refused, ...r.data.errors];
            setErrors(Object.fromEntries(failed.map((x) => [x.roundId, x.error])));
            if (r.data.errors.length) toast.error(r.message ?? br.someFailed);
            else toast.success(r.message ?? br.saved);
            // Keep what is still typed for rounds that did not go through.
            setValues((all) => Object.fromEntries(Object.entries(all).filter(([id]) => failed.some((x) => x.roundId === Number(id)))));
          });
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <Input
          type="search"
          aria-label={br.search}
          placeholder={br.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Enter in the search must not send the results.
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.id}
            onClick={() => setPicked(c.id)}
            className={cn("h-9 rounded-full px-3.5 font-medium", filter === c.id ? "bg-ink text-white" : "bg-surface text-ink-2 shadow-card")}
          >
            {c.label} <span className="tnum">{c.count}</span>
          </button>
        ))}
      </div>
      {sections.map((s) => {
        const visible = s.lottos.filter((r) => shown.has(r.id)).length;
        return (
          <section key={s.group.code} hidden={visible === 0} aria-labelledby={`results-group-${s.group.code}`}>
            <h3 id={`results-group-${s.group.code}`} className="mb-2 text-sm font-semibold text-ink-2">
              {labelOf(s.group)} ({visible})
            </h3>
            <ul className="flex flex-col gap-3">{s.lottos.map(row)}</ul>
          </section>
        );
      })}
      {shown.size === 0 && <p className="py-6 text-center text-sm text-ink-3">{br.noMatch}</p>}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <p className="flex-1 text-sm text-ink-2">{fmt(br.progress, { ready: ready.length, total: rows.length })}</p>
        <Button type="submit" loading={pending} disabled={ready.length === 0}>
          {ready.length > 0 ? fmt(br.submitN, { n: ready.length }) : br.submit}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useI18n } from "@/i18n/client";
import { fmt, formatNumber } from "@/i18n/format";
import { ArrowDownRight, ArrowUpRight, Minus, Table2 } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { formatBaht, formatCompactBaht } from "@/core/rules/money";
import { cn } from "@/lib/cn";

/*
 * Charts for the back office, built per the dataviz method: thin marks (<= 24px, 4px rounded
 * data end, square at the baseline), hairline solid grid, one axis, legend for 2+ series,
 * a hover/focus tooltip that never gates (every chart has a table view), text in ink tokens.
 */

export type VizColor = "viz-1" | "viz-2" | "viz-3" | "viz-4";
export interface ChartSeries {
  key: string;
  label: string;
  color: VizColor;
}
export type ChartRow = { label: string } & Record<string, number | string>;
export type ValueKind = "baht" | "count";

const BG: Record<VizColor | "pos" | "neg", string> = {
  "viz-1": "bg-viz-1",
  "viz-2": "bg-viz-2",
  "viz-3": "bg-viz-3",
  "viz-4": "bg-viz-4",
  pos: "bg-viz-pos",
  neg: "bg-viz-neg",
};

const full = (v: number, kind: ValueKind) => (kind === "baht" ? `฿${formatBaht(v, { decimals: "auto" })}` : formatNumber(v));
const compact = (v: number, kind: ValueKind) => (kind === "baht" ? formatCompactBaht(v) : Math.abs(v) >= 10_000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K` : formatNumber(v));

/** 4-6 round ticks covering [min, max] and zero. */
function niceTicks(min: number, max: number): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (lo === hi) return [0, 1];
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step / 2; t += step) ticks.push(Math.round(t));
  return ticks;
}

export function ColumnChart({
  title,
  rows,
  series,
  kind = "baht",
  height = 180,
  diverging = false,
  emptyText,
}: {
  title: string;
  rows: ChartRow[];
  series: ChartSeries[];
  kind?: ValueKind;
  height?: number;
  /** one series that can go below zero: above uses the positive pole, below the negative pole */
  diverging?: boolean;
  emptyText?: string;
}) {
  const ch = useI18n().t.admin.shell.charts;
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  const values = rows.flatMap((r) => series.map((s) => Number(r[s.key]) || 0));
  const empty = values.every((v) => v === 0);
  const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, 0));
  const top = ticks[ticks.length - 1];
  const bottom = ticks[0];
  const y = (v: number) => ((top - v) / (top - bottom)) * 100; // % from the top
  const zero = y(0);
  const n = rows.length;
  const labelEvery = Math.max(1, Math.ceil(n / 7));
  const peak = !diverging && series.length === 1 && !empty ? values.indexOf(Math.max(...values)) : -1;

  const onKey = (e: KeyboardEvent) => {
    if (n === 0) return;
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    if (e.key in keys) {
      e.preventDefault();
      setActive((a) => Math.min(n - 1, Math.max(0, (a ?? (keys[e.key] > 0 ? -1 : n)) + keys[e.key])));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(n - 1);
    } else if (e.key === "Escape") setActive(null);
  };

  const activeRow = active !== null ? rows[active] : null;
  const tipAlign = active === null ? "center" : active / n < 0.2 ? "left" : active / n > 0.8 ? "right" : "center";

  return (
    <figure className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex-1 font-semibold text-ink">{title}</span>
        {series.length > 1 && (
          <span className="flex flex-wrap gap-3 text-xs text-ink-2">
            {series.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-[3px]", BG[s.color])} aria-hidden="true" />
                {s.label}
              </span>
            ))}
          </span>
        )}
        {diverging && (
          <span className="flex gap-3 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-viz-pos" aria-hidden="true" />
              {ch.gain}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-viz-neg" aria-hidden="true" />
              {ch.loss}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={() => setAsTable((t) => !t)}
          aria-pressed={asTable}
          className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-ink-2 hover:bg-panel hover:text-ink"
        >
          <Table2 className="size-4" aria-hidden="true" />
          {asTable ? ch.asChart : ch.asTable}
        </button>
      </figcaption>

      {asTable ? (
        <div className="max-h-[260px] overflow-auto rounded-control border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-xs text-ink-3">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">{ch.bucket}</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink-2">
                    {r.label}
                  </th>
                  {series.map((s) => (
                    <td key={s.key} className="tnum px-3 py-1.5 text-right">
                      {full(Number(r[s.key]) || 0, kind)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
          {/* y axis */}
          <div className="relative" style={{ height }} aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} className="tnum absolute right-0 -translate-y-1/2 text-[11px] leading-none whitespace-nowrap text-ink-3" style={{ top: `${y(t)}%` }}>
                {compact(t, kind)}
              </span>
            ))}
            <span className="invisible text-[11px] whitespace-nowrap">{compact(ticks.reduce((a, b) => (String(compact(b, kind)).length > String(compact(a, kind)).length ? b : a)), kind)}</span>
          </div>

          {/* plot */}
          <div
            role="group"
            tabIndex={0}
            aria-label={fmt(ch.plotLabel, { title, n })}
            aria-describedby={`${id}-live`}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative rounded-[4px] outline-offset-4"
            style={{ height }}
          >
            {ticks.map((t) => (
              <div key={t} className={cn("pointer-events-none absolute inset-x-0 h-px", t === 0 ? "bg-viz-axis" : "bg-viz-grid")} style={{ top: `${y(t)}%` }} />
            ))}
            {empty && <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">{emptyText ?? ch.empty}</p>}
            <div className="absolute inset-0 flex">
              {rows.map((r, i) => (
                <div
                  key={r.label}
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                  className={cn("relative flex h-full flex-1 justify-center gap-[2px] px-px", active === i && "bg-panel/70")}
                >
                  {series.map((s) => {
                    const v = Number(r[s.key]) || 0;
                    if (v === 0) return <div key={s.key} className="h-full" style={{ width: `min(24px, ${70 / series.length}%)` }} />;
                    const up = v > 0;
                    const color = diverging ? (up ? BG.pos : BG.neg) : BG[s.color];
                    return (
                      <div key={s.key} className="relative h-full" style={{ width: `min(24px, ${70 / series.length}%)` }}>
                        <div
                          className={cn("absolute inset-x-0 transition-[filter]", color, up ? "rounded-t-[4px]" : "rounded-b-[4px]", active === i && "brightness-110")}
                          style={up ? { top: `${y(v)}%`, height: `${zero - y(v)}%` } : { top: `${zero}%`, height: `${y(v) - zero}%` }}
                        />
                        {peak === i && (
                          <span className="tnum pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-full pb-0.5 text-[11px] font-medium whitespace-nowrap text-ink-2" style={{ top: `${y(v)}%` }}>
                            {compact(v, kind)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {activeRow && (
              <div
                role="presentation"
                className={cn(
                  "pointer-events-none absolute -top-2 z-10 min-w-36 -translate-y-full rounded-control border border-line bg-surface px-3 py-2 text-sm shadow-float",
                  tipAlign === "center" && "-translate-x-1/2",
                  tipAlign === "right" && "-translate-x-full",
                )}
                style={{ left: `${((active! + (tipAlign === "center" ? 0.5 : tipAlign === "right" ? 1 : 0)) / n) * 100}%` }}
              >
                <p className="text-xs text-ink-3">{activeRow.label}</p>
                {series.map((s) => {
                  const v = Number(activeRow[s.key]) || 0;
                  return (
                    <p key={s.key} className="mt-0.5 flex items-center gap-2 whitespace-nowrap">
                      <span className={cn("h-0.5 w-3 rounded-full", diverging ? (v >= 0 ? BG.pos : BG.neg) : BG[s.color])} aria-hidden="true" />
                      <b className="tnum font-semibold text-ink">{full(v, kind)}</b>
                      <span className="text-ink-2">{s.label}</span>
                    </p>
                  );
                })}
              </div>
            )}
          </div>

          {/* x axis band (part of the card height, never a nested scroll) */}
          <div />
          <div className="flex pt-1.5" aria-hidden="true">
            {rows.map((r, i) => (
              <span key={r.label} className="flex-1 truncate text-center text-[11px] text-ink-3">
                {i % labelEvery === 0 || i === n - 1 ? r.label : ""}
              </span>
            ))}
          </div>
          <p id={`${id}-live`} aria-live="polite" className="sr-only">
            {activeRow ? `${activeRow.label}: ${series.map((s) => `${s.label} ${full(Number(activeRow[s.key]) || 0, kind)}`).join(", ")}` : ""}
          </p>
        </div>
      )}
    </figure>
  );
}

/** A tiny trend line for a stat tile: de-emphasis gray, the latest step in the accent. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 22 - ((v - min) / span) * 20] as const);
  const path = (list: readonly (readonly [number, number])[]) => list.map(([x, yy]) => `${x.toFixed(2)},${yy.toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className={cn("h-6 w-full", className)} aria-hidden="true">
      <polyline points={path(pts)} fill="none" stroke="var(--color-viz-deemph)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={path(pts.slice(-2))} fill="none" stroke="var(--color-viz-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

/** Signed change against the previous period. Colour = direction x whether up is good; never colour alone. */
export function Delta({ value, upIsGood = true, className }: { value: number | null; upIsGood?: boolean | null; className?: string }): React.ReactNode {
  const ch = useI18n().t.admin.shell.charts;
  if (value === null) return null; // nothing to compare with: say nothing rather than repeat it on every tile
  const pct = Math.round(value * 1000) / 10;
  const flat = pct === 0;
  const good = flat || upIsGood === null ? null : (pct > 0) === upIsGood;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good === null ? "text-ink-2" : good ? "text-success" : "text-danger", className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="tnum">{flat ? "0%" : `${pct > 0 ? "+" : ""}${formatNumber(pct)}%`}</span>
      <span className="sr-only">
        {flat ? ch.same : pct > 0 ? ch.up : ch.down} {ch.vsPrevious}
      </span>
      <span className="font-normal text-ink-3"> {ch.vsPrev}</span>
    </span>
  );
}

/** Ranked horizontal bars, one hue: compare parts of a whole. Value printed at each tip. */
export function RankedBars({ title, items, kind = "baht" }: { title: string; items: { label: string; value: number; hint?: string }[]; kind?: ValueKind }) {
  const ch = useI18n().t.admin.shell.charts;
  const [asTable, setAsTable] = useState(false);
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((i) => i.value), 0);
  const total = sorted.reduce((s, i) => s + i.value, 0);
  return (
    <figure className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card">
      <figcaption className="mb-3 flex items-center gap-3">
        <span className="flex-1 font-semibold text-ink">{title}</span>
        <button
          type="button"
          onClick={() => setAsTable((t) => !t)}
          aria-pressed={asTable}
          className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-ink-2 hover:bg-panel hover:text-ink"
        >
          <Table2 className="size-4" aria-hidden="true" />
          {asTable ? ch.asChart : ch.asTable}
        </button>
      </figcaption>
      {asTable ? (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {sorted.map((i) => (
              <tr key={i.label}>
                <th scope="row" className="py-1.5 text-left font-normal text-ink-2">
                  {i.label}
                </th>
                <td className="tnum py-1.5 text-right">{full(i.value, kind)}</td>
                <td className="tnum py-1.5 pl-3 text-right text-ink-3">{total > 0 ? `${Math.round((i.value / total) * 100)}%` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((i) => (
            <li key={i.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 text-sm">
              <span className="truncate text-ink-2" title={i.hint}>
                {i.label}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-3.5 rounded-r-[4px] bg-viz-1" style={{ width: max > 0 ? `${Math.max(i.value > 0 ? 1.5 : 0, (i.value / max) * 78)}%` : 0 }} />
                <span className="tnum shrink-0 text-xs font-medium text-ink">
                  {compact(i.value, kind)}
                  {total > 0 && <span className="font-normal text-ink-3"> · {Math.round((i.value / total) * 100)}%</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** One whole split into a few parts, read beside its figures: thin bar, swatch on every row. */
export function SplitList({ parts, kind = "baht", totalLabel }: { parts: { label: string; value: number; color: VizColor }[]; kind?: ValueKind; totalLabel: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-panel" role="img" aria-label={parts.map((p) => `${p.label} ${full(p.value, kind)}`).join(", ")}>
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => <span key={p.label} className={cn("h-full first:rounded-l-full last:rounded-r-full", BG[p.color])} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className={cn("size-2.5 shrink-0 rounded-[3px]", BG[p.color])} aria-hidden="true" />
            <span className="flex-1 text-ink-2">{p.label}</span>
            <span className="tnum font-medium text-ink">{full(p.value, kind)}</span>
            <span className="tnum w-10 text-right text-xs text-ink-3">{total > 0 ? `${Math.round((p.value / total) * 100)}%` : "-"}</span>
          </li>
        ))}
        <li className="mt-1 flex items-center gap-2 border-t border-line pt-2">
          <span className="flex-1 font-medium text-ink">{totalLabel}</span>
          <span className="tnum font-semibold text-ink">{full(total, kind)}</span>
          <span className="w-10" />
        </li>
      </ul>
    </div>
  );
}

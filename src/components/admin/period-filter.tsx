import { getI18n } from "@/i18n/rsc";
import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { PERIODS, type DateRange } from "@/domain/periods";
import { cn } from "@/lib/cn";

/**
 * The one filter row above a dashboard or report: preset ranges first, then a custom range.
 * Plain links and a GET form, so it works before any JavaScript loads.
 */
export async function PeriodFilter({ basePath, range, extra = {} }: { basePath: string; range: DateRange; extra?: Record<string, string | undefined> }) {
  const p_ = (await getI18n()).t.admin.shell.period;
  const keep = Object.entries(extra).filter((e): e is [string, string] => !!e[1]);
  const href = (params: Record<string, string>) => `${basePath}?${new URLSearchParams([...keep, ...Object.entries(params)]).toString()}`;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <nav aria-label={p_.label} className="no-scrollbar -mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
        {PERIODS.map((p) => {
          const on = range.period === p.id;
          return (
            <Link
              key={p.id}
              href={href({ period: p.id })}
              aria-current={on ? "true" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                on ? "bg-ink text-white" : "border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              {p_.presets[p.id]}
            </Link>
          );
        })}
      </nav>
      <form method="get" action={basePath} className="flex flex-wrap items-center gap-2">
        {keep.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <CalendarRange className="size-4 text-ink-3" aria-hidden="true" />
        <label className="sr-only" htmlFor="range-from">
          {p_.from}
        </label>
        <input
          id="range-from"
          type="date"
          name="from"
          defaultValue={range.period === "custom" ? range.from : ""}
          max={range.to}
          className="h-9 rounded-control border border-line-strong bg-surface px-2 text-sm"
          required
        />
        <span className="text-sm text-ink-3">{p_.to}</span>
        <label className="sr-only" htmlFor="range-to">
          {p_.toLabel}
        </label>
        <input
          id="range-to"
          type="date"
          name="to"
          defaultValue={range.period === "custom" ? range.to : ""}
          className="h-9 rounded-control border border-line-strong bg-surface px-2 text-sm"
          required
        />
        <button type="submit" className={cn("inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium", range.period === "custom" ? "bg-ink text-white" : "bg-panel text-ink hover:bg-line")}>
          {p_.apply}
        </button>
      </form>
    </div>
  );
}

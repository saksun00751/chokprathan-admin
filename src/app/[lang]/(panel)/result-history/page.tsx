import Link from "next/link";
import { Suspense } from "react";
import { Table, Td, Th } from "@/components/admin/ui";
import { ResultInline } from "@/components/lotto/result-digits";
import { Flag } from "@/components/ui/flag";
import { Badge, Money, PageHeader, Skeleton } from "@/components/ui/primitives";
import { historyQuery } from "@/domain/result-history";
import { fmt, formatDateTime, formatNumber } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getResultHistory } from "@/server/data/result-history";

export const generateMetadata = () => titled((t) => t.admin.ops.resultHistory.title);

export default async function ResultHistoryPage({ searchParams }: PageProps<"/[lang]/result-history">) {
  const h = (await getI18n()).t.admin.ops.resultHistory;
  return (
    <>
      <PageHeader title={h.title} description={h.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <HistoryBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const field = "h-10 rounded-control border border-line-strong bg-surface px-3";

async function HistoryBody({ searchParams }: Pick<PageProps<"/[lang]/result-history">, "searchParams">) {
  const [{ filter, rounds, groups, older }, { lang, t }] = await Promise.all([getResultHistory(await searchParams), getI18n()]);
  const h = t.admin.ops.resultHistory;
  const page = (n: number) => `/result-history${historyQuery({ ...filter, page: n })}`;
  const pageLink = "rounded-control px-3 py-2 font-medium text-brand hover:bg-brand-soft";
  return (
    <>
      {/* The key resets the fields when a link changes the filter. A new search starts at page 1. */}
      <form key={historyQuery(filter)} method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{h.from}</span>
          <input type="date" name="from" defaultValue={filter.from} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{h.to}</span>
          <input type="date" name="to" defaultValue={filter.to} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{t.admin.ops.lottos.groups.field}</span>
          <select name="group" defaultValue={filter.group} className={`${field} min-w-40`}>
            <option value="">{t.common.all}</option>
            {groups.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{t.admin.ops.results.search}</span>
          <input name="q" defaultValue={filter.search} maxLength={40} className={field} />
        </label>
        <button type="submit" className="h-10 rounded-control bg-ink px-4 text-sm font-semibold text-white">
          {h.show}
        </button>
        <Link href="/result-history" className="rounded-control px-2.5 py-2 text-sm text-brand hover:bg-brand-soft">
          {h.clear}
        </Link>
      </form>

      <Table minWidth={860}>
        <thead>
          <tr>
            <Th>{t.admin.ops.rounds.draw}</Th>
            <Th>{h.result}</Th>
            <Th>{h.entered}</Th>
            <Th align="right">{t.admin.ops.rounds.bills}</Th>
            <Th align="right">{h.payout}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rounds.map((r) => (
            <tr key={r.id} className="hover:bg-panel">
              <Td>
                <Link href={`/rounds/${r.id}`} className="flex items-center gap-2 font-medium hover:text-brand">
                  <Flag code={r.flag} className="size-5" />
                  <span>
                    {r.lotto} <span className="font-normal text-ink-3">{r.label}</span>
                  </span>
                </Link>
              </Td>
              <Td>
                <span className="flex items-center gap-2">
                  <ResultInline format={r.format} result={r.result} />
                  {r.corrected && <Badge tone="warning">{h.corrected}</Badge>}
                </span>
              </Td>
              <Td>
                <span className="block">{r.staff ?? h.system}</span>
                {r.resultedAt !== null && <span className="block text-xs whitespace-nowrap text-ink-3">{formatDateTime(r.resultedAt, lang)}</span>}
              </Td>
              <Td align="right" className="tnum">
                {formatNumber(r.bills)}
              </Td>
              <Td align="right">
                <Money satang={r.payout} decimals="auto" />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {rounds.length === 0 && <p className="py-8 text-center text-sm text-ink-3">{h.none}</p>}

      {(filter.page > 1 || older) && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
          {filter.page > 1 && (
            <Link href={page(filter.page - 1)} className={pageLink}>
              {h.newer}
            </Link>
          )}
          <span className="tnum text-ink-3">{fmt(h.page, { n: filter.page })}</span>
          {older && (
            <Link href={page(filter.page + 1)} className={pageLink}>
              {h.older}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

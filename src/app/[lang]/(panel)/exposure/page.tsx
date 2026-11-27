import Link from "next/link";
import { Suspense } from "react";
import { PHASE_TONE, Table, Td, Th } from "@/components/admin/ui";
import { Flag } from "@/components/ui/flag";
import { Badge, Money, PageHeader, Skeleton } from "@/components/ui/primitives";
import { EXPOSURE_STATES, exposureQuery } from "@/domain/list-filters";
import { fmt, formatNumber } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { EXPOSURE_TOP, getExposureOverview } from "@/server/data/exposure";

export const generateMetadata = () => titled((t) => t.admin.ops.exposureAll.title);

export default async function ExposurePage({ searchParams }: PageProps<"/[lang]/exposure">) {
  const x = (await getI18n()).t.admin.ops.exposureAll;
  return (
    <>
      <PageHeader title={x.title} description={fmt(x.description, { n: EXPOSURE_TOP })} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <ExposureBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const field = "h-10 rounded-control border border-line-strong bg-surface px-3";

async function ExposureBody({ searchParams }: Pick<PageProps<"/[lang]/exposure">, "searchParams">) {
  const [{ filter, rows, groups, betTypes }, { t }] = await Promise.all([getExposureOverview(await searchParams), getI18n()]);
  const x = t.admin.ops.exposureAll;
  const typeLabel = new Map(betTypes.map((b) => [b.code, b.label]));
  return (
    <>
      <form key={exposureQuery(filter)} method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{x.state}</span>
          <select name="state" defaultValue={filter.state} className={`${field} min-w-44`}>
            {EXPOSURE_STATES.map((s) => (
              <option key={s} value={s}>
                {x.states[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{x.betType}</span>
          <select name="type" defaultValue={filter.betType} className={`${field} min-w-40`}>
            <option value="">{t.common.all}</option>
            {betTypes.map((b) => (
              <option key={b.code} value={b.code}>
                {b.label}
              </option>
            ))}
          </select>
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
        <button type="submit" className="h-10 rounded-control bg-ink px-4 text-sm font-semibold text-white">
          {x.show}
        </button>
        <Link href="/exposure" className="rounded-control px-2.5 py-2 text-sm text-brand hover:bg-brand-soft">
          {x.clear}
        </Link>
      </form>

      <Table minWidth={760}>
        <thead>
          <tr>
            <Th>{x.number}</Th>
            <Th>{x.betType}</Th>
            <Th>{t.admin.ops.rounds.draw}</Th>
            <Th>{t.admin.ops.rounds.status}</Th>
            <Th align="right">{x.stake}</Th>
            <Th align="right">{x.potential}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-panel">
              <Td className="tnum text-base font-semibold tracking-[0.08em]">{r.number}</Td>
              <Td>{typeLabel.get(r.betType)}</Td>
              <Td>
                <Link href={`/rounds/${r.roundId}`} className="flex items-center gap-2 font-medium hover:text-brand">
                  <Flag code={r.flag} className="size-5" />
                  <span>
                    {r.lotto} <span className="font-normal text-ink-3">{r.round}</span>
                  </span>
                </Link>
              </Td>
              <Td>
                <Badge tone={PHASE_TONE[r.phase]}>{t.admin.shell.phase[r.phase]}</Badge>
              </Td>
              <Td align="right" className="tnum">
                ฿{formatNumber(r.stake)}
              </Td>
              <Td align="right">
                <Money satang={r.potential} decimals="auto" className="font-semibold" />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-ink-3">{x.none}</p>}
    </>
  );
}

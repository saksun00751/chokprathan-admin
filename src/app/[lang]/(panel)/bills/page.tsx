import Link from "next/link";
import { Suspense } from "react";
import { Table, Td, Th } from "@/components/admin/ui";
import { Flag } from "@/components/ui/flag";
import { Badge, Money, PageHeader, Skeleton } from "@/components/ui/primitives";
import { BILL_STATUSES, billQuery, parseBillFilter } from "@/domain/bill-filter";
import { BILL_TONE } from "@/domain/labels";
import { fmt, formatDateTime } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getBills } from "@/server/data/bills";

export const generateMetadata = () => titled((t) => t.admin.ops.billList.title);

export default async function AdminBillsPage({ searchParams }: PageProps<"/[lang]/bills">) {
  const b = (await getI18n()).t.admin.ops.billList;
  return (
    <>
      <PageHeader title={b.title} description={b.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <BillsBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const field = "h-10 rounded-control border border-line-strong bg-surface px-3";

async function BillsBody({ searchParams }: Pick<PageProps<"/[lang]/bills">, "searchParams">) {
  const filter = parseBillFilter(await searchParams);
  const [{ bills, lottos, older }, { lang, t }] = await Promise.all([getBills(filter), getI18n()]);
  const bl = t.admin.ops.billList;
  const page = (n: number) => `/bills${billQuery({ ...filter, page: n })}`;
  const pageLink = "rounded-control px-3 py-2 font-medium text-brand hover:bg-brand-soft";
  return (
    <>
      {/* The key resets the fields when a link changes the filter. A new search starts at page 1. */}
      <form key={billQuery(filter)} method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{bl.day}</span>
          <input type="date" name="day" defaultValue={filter.day} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{t.admin.ops.rounds.lotto}</span>
          <select name="lotto" defaultValue={filter.lottoId ?? ""} className={`${field} min-w-40`}>
            <option value="">{t.admin.ops.rounds.allLottos}</option>
            {lottos.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{bl.status}</span>
          <select name="status" defaultValue={filter.status} className={field}>
            <option value="all">{bl.allStatus}</option>
            {BILL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.lotto.billStatus[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{bl.search}</span>
          <input name="q" defaultValue={filter.search} maxLength={40} className={field} />
        </label>
        <button type="submit" className="h-10 rounded-control bg-ink px-4 text-sm font-semibold text-white">
          {bl.show}
        </button>
        <Link href="/bills" className="rounded-control px-2.5 py-2 text-sm text-brand hover:bg-brand-soft">
          {bl.clear}
        </Link>
      </form>

      <Table minWidth={860}>
        <thead>
          <tr>
            <Th>{bl.code}</Th>
            <Th>{bl.member}</Th>
            <Th>{bl.draw}</Th>
            <Th align="right">{bl.stake}</Th>
            <Th align="right">{bl.payout}</Th>
            <Th>{bl.status}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {bills.map((b) => (
            <tr key={b.id} className="hover:bg-panel">
              <Td>
                <Link href={`/bills/${b.id}`} className="block font-medium hover:text-brand">
                  <span className="tnum">{b.code}</span>
                  <span className="block text-xs font-normal whitespace-nowrap text-ink-3">{formatDateTime(b.createdAt, lang)}</span>
                </Link>
              </Td>
              <Td>
                <Link href={`/members/${b.member.id}`} className="block hover:text-brand">
                  {b.member.name || "-"}
                  <span className="tnum block text-xs text-ink-3">{b.member.phone ?? "-"}</span>
                </Link>
              </Td>
              <Td>
                <span className="flex items-center gap-2">
                  <Flag code={b.flag} className="size-5" />
                  <span>
                    {b.lotto} <span className="text-ink-3">{b.round}</span>
                  </span>
                </span>
              </Td>
              <Td align="right">
                <Money satang={b.stake} decimals="auto" />
              </Td>
              <Td align="right">{b.status === "won" ? <Money satang={b.payout} decimals="auto" className="font-semibold text-gold-text" /> : "-"}</Td>
              <Td>
                <Badge tone={BILL_TONE[b.status]}>{t.lotto.billStatus[b.status]}</Badge>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {bills.length === 0 && <p className="py-8 text-center text-sm text-ink-3">{bl.none}</p>}

      {(filter.page > 1 || older) && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
          {filter.page > 1 && (
            <Link href={page(filter.page - 1)} className={pageLink}>
              {bl.newer}
            </Link>
          )}
          <span className="tnum text-ink-3">{fmt(bl.page, { n: filter.page })}</span>
          {older && (
            <Link href={page(filter.page + 1)} className={pageLink}>
              {bl.older}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

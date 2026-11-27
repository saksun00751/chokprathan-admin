import Link from "next/link";
import { Suspense } from "react";
import { Pager } from "@/components/admin/pager";
import { Table, Td, Th } from "@/components/admin/ui";
import { Money, PageHeader, Skeleton } from "@/components/ui/primitives";
import { ledgerQuery, TX_TYPES, WALLETS } from "@/domain/list-filters";
import { formatDateTime } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getLedger } from "@/server/data/ledger";

export const generateMetadata = () => titled((t) => t.admin.ops.ledger.title);

export default async function LedgerPage({ searchParams }: PageProps<"/[lang]/transactions">) {
  const l = (await getI18n()).t.admin.ops.ledger;
  return (
    <>
      <PageHeader title={l.title} description={l.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <LedgerBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const field = "h-10 rounded-control border border-line-strong bg-surface px-3";

async function LedgerBody({ searchParams }: Pick<PageProps<"/[lang]/transactions">, "searchParams">) {
  const [{ filter, rows, older, members }, { lang, t }] = await Promise.all([getLedger(await searchParams), getI18n()]);
  const l = t.admin.ops.ledger;
  return (
    <>
      {/* The key resets the fields when a link changes the filter. A new search starts at page 1. */}
      <form key={ledgerQuery(filter)} method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{l.from}</span>
          <input type="date" name="from" defaultValue={filter.from} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{l.to}</span>
          <input type="date" name="to" defaultValue={filter.to} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{l.type}</span>
          <select name="type" defaultValue={filter.type} className={`${field} min-w-40`}>
            <option value="">{t.common.all}</option>
            {TX_TYPES.map((x) => (
              <option key={x} value={x}>
                {t.lotto.tx[x]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{l.wallet}</span>
          <select name="wallet" defaultValue={filter.wallet} className={field}>
            <option value="">{t.common.all}</option>
            {WALLETS.map((w) => (
              <option key={w} value={w}>
                {l.wallets[w]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{l.search}</span>
          <input name="q" defaultValue={filter.search} maxLength={40} className={field} />
        </label>
        <button type="submit" className="h-10 rounded-control bg-ink px-4 text-sm font-semibold text-white">
          {l.show}
        </button>
        <Link href="/transactions" className="rounded-control px-2.5 py-2 text-sm text-brand hover:bg-brand-soft">
          {l.clear}
        </Link>
      </form>

      <Table minWidth={900}>
        <thead>
          <tr>
            <Th>{l.time}</Th>
            <Th>{l.member}</Th>
            <Th>{l.type}</Th>
            <Th align="right">{l.amount}</Th>
            <Th align="right">{l.after}</Th>
            <Th>{l.note}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const who = (
              <>
                <span className="block">{r.name || "-"}</span>
                <span className="tnum block text-xs text-ink-3">{r.phone ?? "-"}</span>
              </>
            );
            return (
              <tr key={r.id} className="hover:bg-panel">
                <Td className="whitespace-nowrap">{formatDateTime(r.created_at, lang)}</Td>
                <Td>
                  {members ? (
                    <Link href={`/members/${r.user_id}`} className="hover:text-brand">
                      {who}
                    </Link>
                  ) : (
                    who
                  )}
                </Td>
                <Td>
                  <span className="block">{t.lotto.tx[r.type] ?? r.type}</span>
                  <span className="block text-xs text-ink-3">{l.wallets[r.wallet]}</span>
                </Td>
                <Td align="right">
                  <Money satang={r.amount} sign className={r.amount < 0 ? "text-danger" : "text-success"} />
                </Td>
                <Td align="right">
                  <Money satang={r.balance_after} />
                </Td>
                <Td className="text-xs text-ink-2">
                  {r.ref &&
                    (members ? (
                      <Link href={`/bills?q=${encodeURIComponent(r.ref)}`} className="tnum block text-brand hover:underline">
                        {r.ref}
                      </Link>
                    ) : (
                      <span className="tnum block">{r.ref}</span>
                    ))}
                  {r.note && <span className="block">{r.note}</span>}
                  {r.staff && <span className="block text-ink-3">{r.staff}</span>}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-ink-3">{l.none}</p>}
      <Pager page={filter.page} older={older} href={(page) => `/transactions${ledgerQuery({ ...filter, page })}`} words={l} />
    </>
  );
}

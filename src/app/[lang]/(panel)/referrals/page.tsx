import Link from "next/link";
import { Suspense } from "react";
import { Pager } from "@/components/admin/pager";
import { Table, Td, Th } from "@/components/admin/ui";
import { Money, PageHeader, Skeleton } from "@/components/ui/primitives";
import { referralQuery } from "@/domain/list-filters";
import { formatNumber } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getReferrers } from "@/server/data/referrals";

export const generateMetadata = () => titled((t) => t.admin.ops.referrals.title);

export default async function ReferralsPage({ searchParams }: PageProps<"/[lang]/referrals">) {
  const f = (await getI18n()).t.admin.ops.referrals;
  return (
    <>
      <PageHeader title={f.title} description={f.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <ReferralsBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ReferralsBody({ searchParams }: Pick<PageProps<"/[lang]/referrals">, "searchParams">) {
  const [{ filter, rows, older }, { t }] = await Promise.all([getReferrers(await searchParams), getI18n()]);
  const f = t.admin.ops.referrals;
  return (
    <>
      <form key={referralQuery(filter)} method="get" className="mb-5 flex gap-2">
        <input name="q" defaultValue={filter.search} maxLength={40} placeholder={f.search} aria-label={f.search} className="h-11 w-full max-w-md rounded-control border border-line-strong bg-surface px-3" />
        <button type="submit" className="h-11 rounded-control bg-ink px-4 text-sm font-semibold text-white">
          {f.show}
        </button>
      </form>
      <Table minWidth={820}>
        <thead>
          <tr>
            <Th>{f.referrer}</Th>
            <Th>{f.code}</Th>
            <Th align="right">{f.direct}</Th>
            <Th align="right">{f.indirect}</Th>
            <Th align="right">{f.earned}</Th>
            <Th align="right">{f.unclaimed}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-panel">
              <Td>
                <Link href={`/referrals/${r.id}`} className="block font-medium hover:text-brand">
                  {r.name || "-"}
                  <span className="tnum block text-xs font-normal text-ink-3">{r.phone ?? "-"}</span>
                </Link>
              </Td>
              <Td className="tnum">{r.ref_code}</Td>
              <Td align="right" className="tnum">
                {formatNumber(r.direct)}
              </Td>
              <Td align="right" className="tnum">
                {formatNumber(r.indirect)}
              </Td>
              <Td align="right">
                <Money satang={r.earned} />
              </Td>
              <Td align="right">
                <Money satang={r.affiliate_balance} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-ink-3">{f.none}</p>}
      <Pager page={filter.page} older={older} href={(page) => `/referrals${referralQuery({ ...filter, page })}`} words={f} />
    </>
  );
}

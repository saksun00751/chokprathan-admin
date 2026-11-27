import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Figure, Table, Td, Th } from "@/components/admin/ui";
import { Money, PageHeader, Skeleton } from "@/components/ui/primitives";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getReferrer } from "@/server/data/referrals";

export const generateMetadata = () => titled((t) => t.admin.ops.referrals.title);

export default function ReferrerPage({ params }: PageProps<"/[lang]/referrals/[userId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
      <ReferrerBody params={params} />
    </Suspense>
  );
}

async function ReferrerBody({ params }: Pick<PageProps<"/[lang]/referrals/[userId]">, "params">) {
  const { userId } = await params;
  const [data, { lang, t }] = await Promise.all([getReferrer(Number(userId)), getI18n()]);
  if (!data) notFound();
  const { referrer: r, downline } = data;
  const f = t.admin.ops.referrals;
  return (
    <>
      <PageHeader
        back={{ href: "/referrals", label: f.title }}
        title={r.name || "-"}
        description={`${r.phone ?? "-"} · ${f.code} ${r.ref_code}`}
        actions={
          <Link href={`/members/${r.id}`} className="rounded-control px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-soft">
            {f.profile}
          </Link>
        }
      />
      <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label={f.direct}>{formatNumber(r.direct)}</Figure>
        <Figure label={f.indirect}>{formatNumber(r.indirect)}</Figure>
        <Figure label={f.earned}>
          <Money satang={r.earned} />
        </Figure>
        <Figure label={f.unclaimed}>
          <Money satang={r.affiliate_balance} />
        </Figure>
      </dl>
      <Table minWidth={640}>
        <thead>
          <tr>
            <Th>{f.member}</Th>
            <Th>{f.level}</Th>
            <Th>{f.joined}</Th>
            <Th align="right">{f.stake}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {downline.map((d) => (
            <tr key={d.id} className="hover:bg-panel">
              <Td>
                <Link href={`/members/${d.id}`} className="block font-medium hover:text-brand">
                  {d.name || "-"}
                  <span className="tnum block text-xs font-normal text-ink-3">{d.phone ?? "-"}</span>
                </Link>
              </Td>
              <Td>{fmt(f.levelN, { n: d.level })}</Td>
              <Td className="whitespace-nowrap">{formatDate(d.created_at, lang)}</Td>
              <Td align="right">
                <Money satang={d.stake ?? 0} decimals="auto" />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {downline.length === 0 && <p className="py-8 text-center text-sm text-ink-3">{f.noDownline}</p>}
    </>
  );
}

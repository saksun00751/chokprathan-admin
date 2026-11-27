import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Figure, Table, Td, Th } from "@/components/admin/ui";
import { Flag } from "@/components/ui/flag";
import { Badge, Money, PageHeader, Skeleton } from "@/components/ui/primitives";
import { formatRate } from "@/core/rules/money";
import { BILL_TONE } from "@/domain/labels";
import { fmt, formatDateTime, formatNumber } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getBill } from "@/server/data/bills";

export const generateMetadata = () => titled((t) => t.admin.ops.billList.title);

export default function AdminBillPage({ params }: PageProps<"/[lang]/bills/[billId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
      <BillBody params={params} />
    </Suspense>
  );
}

async function BillBody({ params }: Pick<PageProps<"/[lang]/bills/[billId]">, "params">) {
  const { billId } = await params;
  const [bill, { lang, t }] = await Promise.all([getBill(Number(billId)), getI18n()]);
  if (!bill) notFound();
  const bl = t.admin.ops.billList;
  return (
    <>
      <PageHeader
        back={{ href: "/bills", label: bl.back }}
        title={fmt(bl.detail, { code: bill.code })}
        description={formatDateTime(bill.createdAt, lang)}
        actions={<Badge tone={BILL_TONE[bill.status]}>{t.lotto.billStatus[bill.status]}</Badge>}
      />
      <div className="mb-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <Link href={`/members/${bill.member.id}`} className="hover:text-brand">
          <span className="block text-xs text-ink-3">{bl.member}</span>
          <span className="font-medium">{bill.member.name || "-"}</span> <span className="tnum text-ink-3">{bill.member.phone ?? "-"}</span>
        </Link>
        <Link href={`/rounds/${bill.round.id}`} className="hover:text-brand">
          <span className="block text-xs text-ink-3">{bl.draw}</span>
          <span className="flex items-center gap-2">
            <Flag code={bill.flag} className="size-5" />
            <span className="font-medium">{bill.lotto}</span> <span className="text-ink-3">{bill.round.label}</span>
          </span>
        </Link>
        {bill.settledAt !== null && (
          <span>
            <span className="block text-xs text-ink-3">{bl.settled}</span>
            {formatDateTime(bill.settledAt, lang)}
          </span>
        )}
        {bill.note && (
          <span>
            <span className="block text-xs text-ink-3">{bl.note}</span>
            {bill.note}
          </span>
        )}
      </div>

      <dl className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure label={bl.stake} hint={fmt(bl.items, { n: bill.items.length })}>
          <Money satang={bill.stake} decimals="auto" />
        </Figure>
        <Figure label={bl.discount}>
          <Money satang={bill.discount} decimals="auto" />
        </Figure>
        <Figure label={bl.payout}>
          <Money satang={bill.payout} decimals="auto" />
        </Figure>
      </dl>

      <Table minWidth={640}>
        <thead>
          <tr>
            <Th>{bl.betType}</Th>
            <Th>{bl.number}</Th>
            <Th align="right">{bl.stake}</Th>
            <Th align="right">{bl.rate}</Th>
            <Th align="right">{bl.payout}</Th>
            <Th>{bl.status}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {bill.items.map((i) => (
            <tr key={i.id}>
              <Td>{t.lotto.betTypes[i.betType].label}</Td>
              <Td className="tnum text-base font-semibold tracking-[0.08em]">{i.number}</Td>
              <Td align="right" className="tnum">
                ฿{formatNumber(i.stake)}
              </Td>
              {/* A line paid at several rates lists each part. */}
              <Td align="right" className="tnum">
                {i.segments.length > 1 ? i.segments.map((s) => `฿${formatNumber(s.stake)} × ${formatRate(s.rate100)}`).join(" + ") : `× ${formatRate(i.rate100)}`}
              </Td>
              <Td align="right">{i.status === "won" ? <Money satang={i.payout} decimals="auto" className="font-semibold text-gold-text" /> : "-"}</Td>
              <Td>
                <Badge tone={BILL_TONE[i.status]}>{t.lotto.billStatus[i.status]}</Badge>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

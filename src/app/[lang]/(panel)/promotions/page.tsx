import { Suspense } from "react";
import { PromoEditor, VoucherCreate, VoucherToggle } from "@/components/admin/forms";
import { Table, Td, Th } from "@/components/admin/ui";
import { Badge, Card, Money, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { formatBaht } from "@/domain/money";
import { fmt, formatDate } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getAdminContent } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.content.promotions.title);

export default async function AdminPromotionsPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t.admin.content.promotions.title} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <PromoBody />
      </Suspense>
    </>
  );
}

async function PromoBody() {
  const [{ promotions, vouchers }, { lang, t }] = await Promise.all([getAdminContent(), getI18n()]);
  const pr = t.admin.content.promotions;
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="promos">
        <SectionTitle id="promos" action={<PromoEditor promo={null} />}>
          {pr.promotions}
        </SectionTitle>
        <Card className="divide-y divide-line">
          {promotions.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {p.title}
                  {p.active ? <Badge tone="success">{pr.on}</Badge> : <Badge tone="outline">{pr.off}</Badge>}
                </p>
                <p className="text-sm text-ink-2">{p.summary}</p>
                {p.bonus_percent > 0 && (
                  <p className="tnum text-xs text-ink-3">
                    {fmt(pr.terms, { pct: p.bonus_percent, max: `฿${formatBaht(p.max_bonus, { decimals: "auto" })}`, min: `฿${formatBaht(p.min_deposit, { decimals: "auto" })}`, x: p.turnover_x })}
                    {p.once_per_user ? pr.once : ""}
                  </p>
                )}
              </div>
              <PromoEditor promo={p} />
            </div>
          ))}
        </Card>
      </section>

      <section aria-labelledby="vouchers">
        <SectionTitle id="vouchers">{pr.vouchers}</SectionTitle>
        <VoucherCreate />
        <Table minWidth={640} className="mt-3">
          <thead>
            <tr>
              <Th>{pr.code}</Th>
              <Th align="right">{pr.value}</Th>
              <Th align="right">{pr.used}</Th>
              <Th>{pr.expires}</Th>
              <Th>{pr.note}</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {vouchers.map((v) => (
              <tr key={v.id}>
                <Td className="tnum font-semibold tracking-[0.06em]">
                  {v.code} {!v.active && <Badge tone="outline">{pr.off}</Badge>}
                </Td>
                <Td align="right">
                  <Money satang={v.value} decimals="auto" />
                </Td>
                <Td align="right" className="tnum">
                  {v.used}/{v.max_uses}
                </Td>
                <Td>{v.expires_at ? formatDate(v.expires_at, lang) : pr.never}</Td>
                <Td className="text-ink-2">{v.note ?? "-"}</Td>
                <Td align="right">
                  <VoucherToggle id={v.id} code={v.code} active={v.active === 1} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}

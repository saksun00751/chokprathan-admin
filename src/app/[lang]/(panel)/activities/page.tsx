import { Suspense } from "react";
import { ActivitiesForm } from "@/components/admin/activities-form";
import { Table, Td, Th } from "@/components/admin/ui";
import { Badge, Money, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { formatDateTime } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getAdminActivities } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.content.activities.title);

export default async function AdminActivitiesPage() {
  const ac = (await getI18n()).t.admin.content.activities;
  return (
    <>
      <PageHeader title={ac.title} description={ac.description} />
      <Suspense fallback={<Skeleton className="h-[640px] rounded-card" />}>
        <ActivitiesBody />
      </Suspense>
    </>
  );
}

async function ActivitiesBody() {
  const [data, { lang, t }] = await Promise.all([getAdminActivities(), getI18n()]);
  const ac = t.admin.content.activities;
  const rows = [
    { label: `${ac.wheel} · ${ac.today}`, s: data.stats.wheelToday },
    { label: `${ac.wheel} · ${ac.week}`, s: data.stats.wheelWeek },
    { label: `${ac.guess} · ${ac.today}`, s: data.stats.guessToday },
    { label: `${ac.guess} · ${ac.week}`, s: data.stats.guessWeek },
  ];
  return (
    <div className="flex flex-col gap-8">
      {!data.ready && <p className="rounded-card border border-warning bg-warning-soft px-4 py-3 text-sm">{ac.notReady}</p>}
      <ActivitiesForm initial={data.settings} pointRule={data.pointRule} lottos={data.lottos} />

      <section aria-labelledby="act-stats">
        <SectionTitle id="act-stats">{ac.stats}</SectionTitle>
        <Table minWidth={560}>
          <thead>
            <tr>
              <Th>{ac.period}</Th>
              <Th align="right">{ac.plays}</Th>
              <Th align="right">{ac.pointsUsed}</Th>
              <Th align="right">{ac.paid}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.label}>
                <Td>{r.label}</Td>
                <Td align="right" className="tnum">
                  {r.s.n.toLocaleString("en-US")}
                </Td>
                <Td align="right" className="tnum">
                  {r.s.cost.toLocaleString("en-US")}
                </Td>
                <Td align="right">
                  <Money satang={r.s.paid} decimals="auto" />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section aria-labelledby="act-wins">
        <SectionTitle id="act-wins">{ac.recentWins}</SectionTitle>
        {data.wins.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-4 py-6 text-center text-sm text-ink-3">{ac.noWins}</p>
        ) : (
          <Table minWidth={560}>
            <tbody className="divide-y divide-line">
              {data.wins.map((w) => (
                <tr key={`${w.kind}${w.id}`}>
                  <Td className="whitespace-nowrap text-ink-2">{formatDateTime(Number(w.at), lang)}</Td>
                  <Td>
                    <a href={`/members/${w.user_id}`} className="font-medium hover:text-brand">
                      {w.name}
                    </a>
                    <span className="tnum block text-xs text-ink-3">{w.phone}</span>
                  </Td>
                  <Td>
                    <Badge tone={w.kind === "wheel" ? "brand" : "success"}>{w.kind === "wheel" ? ac.wheel : ac.guess}</Badge>
                  </Td>
                  <Td align="right">
                    <Money satang={w.amount} decimals="auto" className="font-semibold" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

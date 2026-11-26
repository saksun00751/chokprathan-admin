import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { Suspense } from "react";
import { ColumnChart, Delta, RankedBars, Sparkline, SplitList } from "@/components/admin/charts";
import { PeriodFilter } from "@/components/admin/period-filter";
import { Table, Td, Th } from "@/components/admin/ui";
import { Countdown, ServerTimeSync } from "@/components/ui/clock";
import { Flag } from "@/components/ui/flag";
import { Card, Money, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { formatBaht } from "@/core/rules/money";
import { rangeLabel } from "@/domain/periods";
import type { Dict } from "@/i18n/dictionaries";
import { fmt, formatDate, formatDateTime, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { getI18n, titled } from "@/i18n/rsc";
import { cn } from "@/lib/cn";
import { getDashboard, type DashboardData, type HealthCheck } from "@/server/data/dashboard";

export const generateMetadata = () => titled((t) => t.admin.dashboard.title);

export default async function AdminDashboard({ searchParams }: PageProps<"/[lang]">) {
  const db = (await getI18n()).t.admin.dashboard;
  return (
    <>
      <PageHeader title={db.title} description={db.description} />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-9 w-full max-w-xl rounded-full" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Skeleton className="h-52 rounded-card" />
        <Skeleton className="h-52 rounded-card" />
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function DashboardBody({ searchParams }: { searchParams: PageProps<"/[lang]">["searchParams"] }) {
  const sp = await searchParams;
  const [d, { lang, t }] = await Promise.all([getDashboard({ period: one(sp.period), from: one(sp.from), to: one(sp.to) }), getI18n()]);
  const db = t.admin.dashboard;
  const per = t.admin.shell.period;
  const bucketWord = d.range.bucket === "hour" ? db.hourly : db.daily;
  return (
    <div className="flex flex-col gap-8">
      <ServerTimeSync serverNow={d.serverNow} />
      <PeriodFilter basePath="/" range={d.range} />
      <p className="-mt-4 text-sm text-ink-2">
        {rangeLabel(d.range, per)} · {d.range.from === d.range.to ? formatDate(d.range.startMs, lang, "long") : fmt(per.range, { from: formatDate(d.range.startMs, lang), to: formatDate(d.range.endMs - 1, lang) })}
      </p>

      <ActionStrip d={d} lang={lang} t={t} />

      {d.betting && d.chart && (
        <section aria-labelledby="money" className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <h2 id="money" className="sr-only">
            {db.results}
          </h2>
          <Card className="flex flex-col justify-between gap-5 p-5">
            <div>
              <p className="text-sm text-ink-2">{db.ggr}</p>
              <p className={cn("mt-1 text-5xl leading-none font-semibold tracking-tight", d.betting.ggr < 0 ? "text-danger" : "text-ink")}>
                {d.betting.ggr < 0 ? "-" : ""}฿{formatBaht(Math.abs(d.betting.ggr), { decimals: "auto" })}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <Delta value={d.betting.change.ggr} upIsGood />
                {d.betting.margin !== null && <span className="text-xs text-ink-2">{fmt(db.margin, { pct: (d.betting.margin * 100).toFixed(1) })}</span>}
              </div>
            </div>
            <Sparkline values={d.chart.map((c) => c.ggr)} className="h-10" />
            <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
              <div>
                <dt className="text-ink-3">{db.ngr}</dt>
                <dd className={cn("mt-0.5 text-lg font-semibold", d.betting.ngr < 0 ? "text-danger" : "text-ink")}>
                  <Money satang={d.betting.ngr} decimals="auto" />
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">{db.pending}</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink">
                  <Money satang={d.queue?.pendingStake ?? 0} decimals="auto" />
                </dd>
                <dd className="text-xs text-ink-3">{fmt(db.bills, { n: formatNumber(d.queue?.pendingBills ?? 0) })}</dd>
              </div>
            </dl>
          </Card>

          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Tile label={db.turnover} value={<Money satang={d.betting.turnover} decimals="auto" />} delta={<Delta value={d.betting.change.turnover} upIsGood />} trend={d.chart.map((c) => c.turnover)} hint={fmt(db.bills, { n: formatNumber(d.betting.bills) })} />
            <Tile label={db.payout} value={<Money satang={d.betting.payout} decimals="auto" />} delta={<Delta value={d.betting.change.payout} upIsGood={null} />} hint={<>{db.fromSettled} <Money satang={d.betting.settledStake} decimals="auto" /></>} />
            <Tile label={db.players} value={fmt(db.people, { n: formatNumber(d.betting.players) })} delta={<Delta value={d.betting.change.players} upIsGood />} hint={db.playersHint} />
            {d.money && (
              <>
                <Tile label={db.deposits} value={<Money satang={d.money.deposits.sum} decimals="auto" />} delta={<Delta value={d.money.change.deposits} upIsGood />} trend={d.chart.map((c) => c.deposits)} hint={fmt(db.items, { n: formatNumber(d.money.deposits.n) })} />
                <Tile label={db.withdrawals} value={<Money satang={d.money.withdrawals.sum} decimals="auto" />} delta={<Delta value={d.money.change.withdrawals} upIsGood={null} />} hint={fmt(db.items, { n: formatNumber(d.money.withdrawals.n) })} />
                <Tile label={db.newMembers} value={fmt(db.people, { n: formatNumber(d.money.newMembers) })} delta={<Delta value={d.money.change.newMembers} upIsGood />} hint={fmt(db.firstDeposits, { n: formatNumber(d.money.firstDeposits) })} />
              </>
            )}
          </dl>
        </section>
      )}

      {!d.betting && d.money && (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label={db.deposits} value={<Money satang={d.money.deposits.sum} decimals="auto" />} delta={<Delta value={d.money.change.deposits} upIsGood />} hint={fmt(db.items, { n: formatNumber(d.money.deposits.n) })} />
          <Tile label={db.withdrawals} value={<Money satang={d.money.withdrawals.sum} decimals="auto" />} delta={<Delta value={d.money.change.withdrawals} upIsGood={null} />} hint={fmt(db.items, { n: formatNumber(d.money.withdrawals.n) })} />
          <Tile label={db.newMembers} value={fmt(db.people, { n: formatNumber(d.money.newMembers) })} delta={<Delta value={d.money.change.newMembers} upIsGood />} />
          <Tile label={db.firstDepositsTile} value={fmt(db.people, { n: formatNumber(d.money.firstDeposits) })} delta={<Delta value={d.money.change.firstDeposits} upIsGood />} />
        </dl>
      )}

      {d.chart && (
        <section aria-label={db.charts} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {d.betting && <ColumnChart title={fmt(db.turnoverChart, { bucket: bucketWord })} rows={d.chart.map((c) => ({ label: c.label, turnover: c.turnover }))} series={[{ key: "turnover", label: db.turnover, color: "viz-1" }]} />}
          {d.betting && <ColumnChart title={fmt(db.ggrChart, { bucket: bucketWord })} rows={d.chart.map((c) => ({ label: c.label, ggr: c.ggr }))} series={[{ key: "ggr", label: db.ggrSeries, color: "viz-1" }]} diverging />}
          {d.money && (
            <ColumnChart
              title={fmt(db.moneyChart, { bucket: bucketWord })}
              rows={d.chart.map((c) => ({ label: c.label, deposits: c.deposits, withdrawals: c.withdrawals }))}
              series={[
                { key: "deposits", label: db.depositSeries, color: "viz-1" },
                { key: "withdrawals", label: db.withdrawSeries, color: "viz-2" },
              ]}
            />
          )}
          {d.breakdown && (
            <RankedBars title={db.byGroup} items={d.breakdown.groups.map((g) => ({ label: g.label, value: g.stake, hint: fmt(db.bills, { n: formatNumber(g.bills) }) }))} />
          )}
        </section>
      )}

      {d.costs && d.owed && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="mb-3 font-semibold text-ink">{db.costs}</h2>
            <SplitList
              totalLabel={db.total}
              parts={[
                { label: db.bonus, value: d.costs.bonus, color: "viz-1" },
                { label: db.cashback, value: d.costs.cashback, color: "viz-2" },
                { label: db.affiliate, value: d.costs.affiliate, color: "viz-3" },
                { label: db.voucher, value: d.costs.voucher, color: "viz-4" },
              ]}
            />
            {d.costs.adjust !== 0 && (
              <p className="mt-3 text-xs text-ink-3">
                {fmt(db.adjustNote, { amount: `${d.costs.adjust > 0 ? "+" : d.costs.adjust < 0 ? "-" : ""}฿${formatBaht(Math.abs(d.costs.adjust), { decimals: "auto" })}` })}
              </p>
            )}
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 font-semibold text-ink">{db.owed}</h2>
            <p className="text-3xl font-semibold text-ink">
              <Money satang={d.owed.balance + d.owed.cashback + d.owed.affiliate} decimals="auto" />
            </p>
            <p className="mt-1 text-sm text-ink-2">{fmt(db.owedNote, { n: formatNumber(d.owed.members) })}</p>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-sm">
              <div>
                <dt className="text-ink-3">{db.mainWallet}</dt>
                <dd className="font-medium">
                  <Money satang={d.owed.balance} decimals="auto" />
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">{db.cashback}</dt>
                <dd className="font-medium">
                  <Money satang={d.owed.cashback} decimals="auto" />
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">{db.affiliateWallet}</dt>
                <dd className="font-medium">
                  <Money satang={d.owed.affiliate} decimals="auto" />
                </dd>
              </div>
            </dl>
          </Card>
        </section>
      )}

      {d.breakdown && (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="min-w-0">
            <SectionTitle action={<Link href={`/reports/lottos?${new URLSearchParams({ from: d.range.from, to: d.range.to })}`} className="text-sm font-semibold text-brand hover:underline">{db.fullReport}</Link>}>
              {db.topLottos}
            </SectionTitle>
            <Table minWidth={520}>
              <thead>
                <tr>
                  <Th>{db.lotto}</Th>
                  <Th align="right">{db.billsCol}</Th>
                  <Th align="right">{db.turnover}</Th>
                  <Th align="right">{db.ggrCol}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.breakdown.topLottos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-ink-3">
                      {db.noBills}
                    </td>
                  </tr>
                )}
                {d.breakdown.topLottos.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      <span className="flex items-center gap-2 font-medium">
                        <Flag code={l.flag} className="size-5" />
                        {l.name}
                      </span>
                    </Td>
                    <Td align="right" className="tnum">
                      {formatNumber(l.bills)}
                    </Td>
                    <Td align="right">
                      <Money satang={l.stake} decimals="auto" />
                    </Td>
                    <Td align="right">
                      <Money satang={l.ggr} sign decimals="auto" className={l.ggr < 0 ? "text-danger" : l.ggr > 0 ? "text-success" : ""} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="min-w-0">
            <SectionTitle action={<Link href={`/reports/players?${new URLSearchParams({ from: d.range.from, to: d.range.to })}`} className="text-sm font-semibold text-brand hover:underline">{db.fullReport}</Link>}>
              {db.topPlayers}
            </SectionTitle>
            <Table minWidth={520}>
              <thead>
                <tr>
                  <Th>{db.member}</Th>
                  <Th align="right">{db.turnover}</Th>
                  <Th align="right">{db.memberResult}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.breakdown.topPlayers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-ink-3">
                      {db.noBills}
                    </td>
                  </tr>
                )}
                {d.breakdown.topPlayers.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <Link href={`/members/${p.id}`} className="block font-medium hover:text-brand">
                        {p.name || "-"}
                        <span className="tnum block text-xs font-normal text-ink-3">{p.phone}</span>
                      </Link>
                    </Td>
                    <Td align="right">
                      <Money satang={p.stake} decimals="auto" />
                      <span className="block text-xs text-ink-3">{fmt(db.bills, { n: formatNumber(p.bills) })}</span>
                    </Td>
                    <Td align="right">
                      <Money satang={p.payout - p.stake} sign decimals="auto" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </section>
      )}

      {d.risk && (
        <section aria-labelledby="watch" className="min-w-0">
          <SectionTitle id="watch">{db.watch}</SectionTitle>
          <Table minWidth={720}>
            <thead>
              <tr>
                <Th>{db.draw}</Th>
                <Th>{db.closesIn}</Th>
                <Th align="right">{db.pendingStake}</Th>
                <Th align="right">{db.maxPayout}</Th>
                <Th align="right">{db.cuts}</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.risk.watch.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-ink-3">
                    {db.noOpen}
                  </td>
                </tr>
              )}
              {d.risk.watch.map((r) => (
                <tr key={r.id} className="hover:bg-panel">
                  <Td>
                    <span className="flex items-center gap-2 font-medium">
                      <Flag code={r.flag} className="size-5" />
                      {r.lotto} <span className="font-normal text-ink-3">{r.label}</span>
                    </span>
                  </Td>
                  <Td>
                    <Countdown closesAt={r.closesAt} serverNow={d.serverNow} />
                  </Td>
                  <Td align="right">
                    <Money satang={r.stake} decimals="auto" />
                  </Td>
                  <Td align="right">
                    <Money satang={r.liability} decimals="auto" className="font-semibold" />
                  </Td>
                  <Td align="right" className="tnum">
                    {r.cuts}
                  </Td>
                  <Td align="right">
                    <Link href={`/rounds/${r.id}`} className="font-semibold text-brand hover:underline">
                      {db.viewRisk}
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}

      <section aria-labelledby="health">
        <SectionTitle id="health">{db.health}</SectionTitle>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {d.health.map((h) => (
            <HealthItem key={h.id} check={h} state={db.state[h.state]} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value, delta, trend, hint }: { label: string; value: React.ReactNode; delta?: React.ReactNode; trend?: number[]; hint?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="mt-1 truncate text-xl font-semibold text-ink [font-variant-numeric:normal] [&_.tnum]:[font-variant-numeric:normal]">{value}</dd>
      {delta && <dd className="mt-1 empty:hidden">{delta}</dd>}
      {hint && <dd className="mt-0.5 text-xs text-ink-3">{hint}</dd>}
      {trend && (
        <dd className="mt-auto pt-2">
          <Sparkline values={trend} />
        </dd>
      )}
    </div>
  );
}

function ActionStrip({ d, lang, t }: { d: DashboardData; lang: Locale; t: Dict }) {
  const db = t.admin.dashboard;
  const money = (satang: number) => `฿${formatBaht(satang, { decimals: "auto" })}`;
  const items: React.ReactNode[] = [];
  if (d.queue && d.show.finance && (d.queue.deposits.n > 0 || d.queue.withdrawals.n > 0)) {
    items.push(
      <Link key="finance" href="/finance" className="flex items-center gap-3 rounded-card bg-gold-soft px-4 py-3 text-sm text-gold-ink hover:brightness-[0.98]">
        <Banknote className="size-5 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          {fmt(db.queue, { deposits: d.queue.deposits.n, depositSum: money(d.queue.deposits.sum), withdrawals: d.queue.withdrawals.n, withdrawSum: money(d.queue.withdrawals.sum) })}
        </span>
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>,
    );
  }
  if (d.risk && d.risk.awaiting.length > 0) {
    items.push(
      <Link key="results" href="/results" className="flex items-center gap-3 rounded-card bg-warning-soft px-4 py-3 text-sm text-warning hover:brightness-[0.98]">
        <ClipboardCheck className="size-5 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          {fmt(db.awaiting, { n: d.risk.awaiting.length, lotto: d.risk.awaiting[0].lotto, label: d.risk.awaiting[0].label, time: formatDateTime(d.risk.awaiting[0].closesAt, lang) })}
        </span>
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>,
    );
  }
  return items.length ? <div className="-mt-2 flex flex-col gap-2">{items}</div> : null;
}

const HEALTH_ICON = { good: CheckCircle2, warning: AlertTriangle, critical: XCircle } as const;
function HealthItem({ check, state }: { check: HealthCheck; state: string }) {
  const Icon = HEALTH_ICON[check.state];
  return (
    <li className="flex gap-3 rounded-card border border-line bg-surface p-3.5">
      <Icon className={cn("mt-0.5 size-5 shrink-0", check.state === "good" ? "text-success" : check.state === "warning" ? "text-warning" : "text-danger")} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {check.label} <span className={cn("text-xs font-semibold", check.state === "good" ? "text-success" : check.state === "warning" ? "text-warning" : "text-danger")}>{state}</span>
        </p>
        <p className="mt-0.5 text-xs text-ink-2">{check.detail}</p>
      </div>
    </li>
  );
}

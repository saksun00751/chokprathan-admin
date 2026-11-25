import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmResult } from "@/components/admin/confirm-result";
import { CorrectionPanel } from "@/components/admin/correction-panel";
import { ApplyConfigButton, CancelRoundButton, CloseRoundButton, ExposurePanel, ResultForm } from "@/components/admin/round-tools";
import { Figure, PHASE_TONE } from "@/components/admin/ui";
import { ResultDigits } from "@/components/lotto/result-digits";
import { Countdown, ServerTimeSync } from "@/components/ui/clock";
import { Flag } from "@/components/ui/flag";
import { Badge, Card, Money, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { isBetTypeCode } from "chokprathan-core/rules/betTypes";
import { fmt, formatDateTime, formatNumber } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getAdminRound } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.ops.round.title);

export default function AdminRoundPage({ params }: PageProps<"/[lang]/rounds/[roundId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px] rounded-card" />}>
      <RoundBody params={params} />
    </Suspense>
  );
}

async function RoundBody({ params }: Pick<PageProps<"/[lang]/rounds/[roundId]">, "params">) {
  const { roundId } = await params;
  const id = Number(roundId);
  if (!Number.isInteger(id)) notFound();
  const [data, { lang, t }] = await Promise.all([getAdminRound(id), getI18n()]);
  if (!data) notFound();
  const { round, lotto } = data;
  const rd = t.admin.ops.round;
  const phase = { tone: PHASE_TONE[round.phase], label: t.admin.shell.phase[round.phase] };

  return (
    <>
      <ServerTimeSync serverNow={data.serverNow} />
      <PageHeader
        back={{ href: `/rounds?day=${new Date(round.closesAt + 7 * 3_600_000).toISOString().slice(0, 10)}`, label: rd.all }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Flag code={lotto.flag} className="size-8" />
            {lotto.name} {round.label}
            <Badge tone={phase.tone}>{phase.label}</Badge>
          </span>
        }
        description={fmt(rd.times, { opens: formatDateTime(round.opensAt, lang), closes: formatDateTime(round.closesAt, lang), draw: formatDateTime(round.drawAt, lang) })}
        actions={
          <span className="flex flex-wrap gap-2">
            {data.canApplyConfig && <ApplyConfigButton roundId={round.id} round={`${lotto.name} ${round.label}`} />}
            {data.canCancel && (round.phase === "open" || round.phase === "closed" || round.phase === "confirming") && (
              <>
                {round.phase === "open" && <CloseRoundButton roundId={round.id} round={`${lotto.name} ${round.label}`} />}
                <CancelRoundButton roundId={round.id} round={`${lotto.name} ${round.label}`} />
              </>
            )}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Figure label={rd.totalStake}>
              <Money satang={data.totals.stake} decimals="auto" />
            </Figure>
            <Figure label={rd.bills}>{formatNumber(data.totals.bills)}</Figure>
            <Figure label={rd.members}>{formatNumber(data.totals.members)}</Figure>
            <Figure label={round.phase === "open" ? rd.closesIn : rd.status}>
              {round.phase === "open" ? <Countdown closesAt={round.closesAt} serverNow={data.serverNow} /> : phase.label}
            </Figure>
          </dl>

          {data.liability.length > 0 && (
            <section aria-labelledby="liability">
              <SectionTitle id="liability">{rd.liability}</SectionTitle>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {data.liability.map((l) => (
                  <Figure key={l.betType} label={isBetTypeCode(l.betType) ? t.lotto.betTypes[l.betType].label : l.betType} hint={fmt(rd.taken, { amount: formatNumber(l.stake) })}>
                    <Money satang={l.max} decimals="auto" />
                  </Figure>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="exposure">
            <SectionTitle id="exposure">{rd.exposure}</SectionTitle>
            <ExposurePanel roundId={round.id} rows={data.exposure} configs={data.configs} manual={data.manual} editable={data.canLimit && round.phase === "open"} />
          </section>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-20">
          {data.mismatch && (
            <p role="alert" className="rounded-card border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
              {t.admin.ops.correction.mismatch}
            </p>
          )}
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{rd.result}</h2>
            {round.result ? (
              <>
                <ResultDigits format={lotto.format} result={round.result} />
                {round.resultedAt && <p className="mt-3 text-xs text-ink-3">{fmt(rd.resultedAt, { time: formatDateTime(round.resultedAt, lang) })}</p>}
              </>
            ) : data.pending ? (
              <ConfirmResult roundId={round.id} format={lotto.format} round={`${lotto.name} ${round.label}`} {...data.pending} canConfirm={data.canConfirm} canEnter={data.canResult} />
            ) : round.phase === "closed" ? (
              data.canResult ? (
                <ResultForm roundId={round.id} format={lotto.format} round={`${lotto.name} ${round.label}`} />
              ) : (
                <p className="text-sm text-ink-3">{rd.noPermission}</p>
              )
            ) : round.phase === "cancelled" ? (
              <p className="text-sm text-ink-2">{rd.cancelled}</p>
            ) : (
              <p className="text-sm text-ink-2">
                {rd.afterClose}
                {lotto.autoResult ? rd.auto : ""}
              </p>
            )}
          </Card>
          {data.correction && (
            <Card className="flex flex-col p-5">
              <CorrectionPanel roundId={round.id} format={lotto.format} round={`${lotto.name} ${round.label}`} pending={data.correction.pending} />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

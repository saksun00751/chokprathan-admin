import Link from "next/link";
import { Suspense } from "react";
import { PHASE_TONE, Table, Td, Th } from "@/components/admin/ui";
import { Flag } from "@/components/ui/flag";
import { Badge, Money, PageHeader, Skeleton } from "@/components/ui/primitives";
import { addDays } from "@/domain/time";
import { formatClock } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getAdminRounds } from "@/server/data/admin";
import type { RoundPhase } from "@/server/services/rounds";

export const generateMetadata = () => titled((t) => t.admin.ops.rounds.title);

const PHASES: (RoundPhase | "all")[] = ["all", "open", "closed", "resulted", "upcoming", "cancelled"];

export default async function AdminRoundsPage({ searchParams }: PageProps<"/[lang]/rounds">) {
  const r = (await getI18n()).t.admin.ops.rounds;
  return (
    <>
      <PageHeader title={r.title} description={r.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <RoundsBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function RoundsBody({ searchParams }: Pick<PageProps<"/[lang]/rounds">, "searchParams">) {
  const sp = await searchParams;
  const lottoId = typeof sp.lotto === "string" && sp.lotto ? Number(sp.lotto) : undefined;
  const phase = PHASES.find((p) => p === sp.phase) ?? "all";
  const [{ day, rounds, lottos }, { t }] = await Promise.all([getAdminRounds({ day: typeof sp.day === "string" ? sp.day : undefined, lottoId, phase }), getI18n()]);
  const ro = t.admin.ops.rounds;
  const phases = t.admin.shell.phase;

  return (
    <>
      <form className="mb-5 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4" method="get">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{ro.day}</span>
          <input type="date" name="day" defaultValue={day} className="h-10 rounded-control border border-line-strong px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{ro.lotto}</span>
          <select name="lotto" defaultValue={lottoId ?? ""} className="h-10 min-w-40 rounded-control border border-line-strong bg-surface px-3">
            <option value="">{ro.allLottos}</option>
            {lottos.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{ro.status}</span>
          <select name="phase" defaultValue={phase} className="h-10 rounded-control border border-line-strong bg-surface px-3">
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {p === "all" ? ro.allStatus : phases[p]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 rounded-control bg-ink px-4 text-sm font-semibold text-white">
          {ro.show}
        </button>
        <span className="flex gap-1 text-sm">
          <Link className="rounded-control px-2.5 py-2 text-brand hover:bg-brand-soft" href={`/rounds?day=${addDays(day, -1)}`}>
            {ro.prevDay}
          </Link>
          <Link className="rounded-control px-2.5 py-2 text-brand hover:bg-brand-soft" href="/rounds">
            {ro.today}
          </Link>
          <Link className="rounded-control px-2.5 py-2 text-brand hover:bg-brand-soft" href={`/rounds?day=${addDays(day, 1)}`}>
            {ro.nextDay}
          </Link>
        </span>
      </form>

      <Table minWidth={760}>
        <thead>
          <tr>
            <Th>{ro.draw}</Th>
            <Th>{ro.closes}</Th>
            <Th>{ro.status}</Th>
            <Th align="right">{ro.bills}</Th>
            <Th align="right">{ro.stake}</Th>
            <Th align="right">{ro.result}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rounds.map((r) => (
            <tr key={r.id} className="hover:bg-panel">
              <Td>
                <Link href={`/rounds/${r.id}`} className="flex items-center gap-2 font-medium hover:text-brand">
                  <Flag code={r.flag} className="size-5" />
                  {r.lotto} <span className="font-normal text-ink-3">{r.label}</span>
                </Link>
              </Td>
              <Td className="tnum">{formatClock(r.closesAt)}</Td>
              <Td>
                <Badge tone={PHASE_TONE[r.phase]}>{phases[r.phase]}</Badge>
              </Td>
              <Td align="right" className="tnum">
                {r.bills}
              </Td>
              <Td align="right">
                <Money satang={r.stake} decimals="auto" />
              </Td>
              <Td align="right" className="tnum font-semibold tracking-[0.06em]">
                {r.result ?? "-"}
              </Td>
            </tr>
          ))}
          {rounds.length === 0 && (
            <tr>
              <Td className="py-8 text-center text-ink-3" align="center">
                {ro.none}
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}

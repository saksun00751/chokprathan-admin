import Link from "next/link";
import { Suspense } from "react";
import { GameProductToggle } from "@/components/admin/games-admin";
import { Table, Td, Th } from "@/components/admin/ui";
import { Badge, Money, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { GAME_GROUPS } from "@/domain/game-products";
import { fmt, formatDateTime } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getAdminGames } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.content.games.title);

export default async function AdminGamesPage() {
  const ga = (await getI18n()).t.admin.content.games;
  return (
    <>
      <PageHeader title={ga.title} description={ga.description} />
      <Suspense fallback={<Skeleton className="h-[640px] rounded-card" />}>
        <GamesBody />
      </Suspense>
    </>
  );
}

async function GamesBody() {
  const [data, { lang, t }] = await Promise.all([getAdminGames(), getI18n()]);
  const ga = t.admin.content.games;
  const groups = t.site.games.categories;
  return (
    <div className="flex flex-col gap-8">
      {!data.ready && <p className="rounded-card border border-warning bg-warning-soft px-4 py-3 text-sm">{ga.notReady}</p>}

      {/* The member site owns the aggregator and syncs the catalog; the back office only switches products on and off. */}
      <p className="text-sm text-ink-3">{data.lastSync ? fmt(ga.lastSync, { time: formatDateTime(data.lastSync, lang) }) : ga.never}</p>

      <section aria-labelledby="game-stats">
        <SectionTitle id="game-stats">{ga.stats}</SectionTitle>
        <Table minWidth={640}>
          <thead>
            <tr>
              <Th>{ga.group}</Th>
              <Th align="right">{ga.today}</Th>
              <Th align="right">{ga.week}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {GAME_GROUPS.map((k) => (
              <tr key={k}>
                <Td>{groups[k]}</Td>
                {[data.today[k], data.week[k]].map((s, i) => (
                  <Td key={i} align="right">
                    <span className="block font-semibold">
                      <Money satang={s.bets - s.paid} sign decimals="auto" />
                    </span>
                    <span className="tnum block text-xs text-ink-3">
                      {fmt(ga.statLine, { n: s.n.toLocaleString("en-US") })} · {ga.bets} <Money satang={s.bets} decimals="auto" /> · {ga.paid}{" "}
                      <Money satang={s.paid} decimals="auto" />
                    </span>
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-ink-3">{ga.netHint}</p>
      </section>

      <section aria-labelledby="game-products">
        <SectionTitle id="game-products">{ga.products}</SectionTitle>
        {data.products.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-4 py-6 text-center text-sm text-ink-3">{ga.noProducts}</p>
        ) : (
          GAME_GROUPS.map((k) => {
            const list = data.products.filter((p) => (p.group === k ? true : k === "other" && !GAME_GROUPS.includes(p.group as never)));
            if (list.length === 0) return null;
            return (
              <div key={k} className="mb-6">
                <h3 className="mb-2 text-sm font-semibold text-ink-2">
                  {groups[k]} ({list.length})
                </h3>
                <Table minWidth={560}>
                  <thead>
                    <tr>
                      <Th>{ga.productCol}</Th>
                      <Th align="right">{ga.gamesCol}</Th>
                      <Th>{ga.state}</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.map((p) => (
                      <tr key={p.id}>
                        <Td>
                          <span className="block font-medium">{p.name}</span>
                          <span className="block font-mono text-[11px] text-ink-3">{p.id}</span>
                        </Td>
                        <Td align="right" className="tnum">
                          {p.games.toLocaleString("en-US")}
                        </Td>
                        <Td>
                          {!p.available ? (
                            <Badge tone="outline">{ga.notOffered}</Badge>
                          ) : p.enabled ? (
                            <Badge tone="success">{ga.on}</Badge>
                          ) : (
                            <Badge tone="outline">{ga.off}</Badge>
                          )}
                        </Td>
                        <Td align="right">{p.available && <GameProductToggle id={p.id} name={p.name} enabled={p.enabled} />}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            );
          })
        )}
      </section>

      <section aria-labelledby="game-shortfalls">
        <SectionTitle id="game-shortfalls">{ga.shortfalls}</SectionTitle>
        <p className="mb-2 text-sm text-ink-3">{ga.shortfallsHint}</p>
        {data.shortfalls.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-4 py-6 text-center text-sm text-ink-3">{ga.noShortfalls}</p>
        ) : (
          <Table minWidth={560}>
            <tbody className="divide-y divide-line">
              {data.shortfalls.map((s) => (
                <tr key={s.id}>
                  <Td className="whitespace-nowrap text-ink-2">{formatDateTime(s.created_at, lang)}</Td>
                  <Td>
                    <Link href={`/members/${s.user_id}`} className="font-medium hover:text-brand">
                      {s.name}
                    </Link>
                    <span className="tnum block text-xs text-ink-3">{s.phone}</span>
                  </Td>
                  <Td className="font-mono text-xs">
                    {s.product_id} · {s.txn_id}
                  </Td>
                  <Td align="right">
                    <Money satang={s.shortfall} className="font-semibold text-danger" />
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

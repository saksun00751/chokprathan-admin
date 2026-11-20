import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MemberActions, MemberCloseForm, MemberEditForm, MemberPointsForm } from "@/components/admin/forms";
import { MemberBlockForm, UnblockButton } from "@/components/admin/blocklist";
import { Figure } from "@/components/admin/ui";
import { Badge, Card, Money, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { BILL_TONE, type BillStatus } from "@/domain/labels";
import { formatBaht } from "@/domain/money";
import { fmt, formatDate, formatDateTime } from "@/i18n/format";
import { bankName } from "@/i18n/labels";
import { getI18n, titled } from "@/i18n/rsc";
import { getMember } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.people.member.title);

/** Notes the system writes for these types repeat the type itself; staff-written notes are kept. */
const STAFF_NOTE_TYPES = new Set(["adjust", "withdraw_refund"]);

export default function AdminMemberPage({ params }: PageProps<"/[lang]/members/[userId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px] rounded-card" />}>
      <MemberBody params={params} />
    </Suspense>
  );
}

async function MemberBody({ params }: Pick<PageProps<"/[lang]/members/[userId]">, "params">) {
  const { userId } = await params;
  const [data, i18n] = await Promise.all([getMember(Number(userId)), getI18n()]);
  if (!data) notFound();
  const { lang, t: d } = i18n;
  const mb = d.admin.people.member;
  const mm = d.admin.people.members;
  const { user, totals, bills, tx, upline, adjustments } = data;
  const closed = user.status === "closed";

  return (
    <>
      <PageHeader
        back={{ href: "/members", label: mb.back }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {user.name}
            {user.status === "active" ? <Badge tone="success">{mm.active}</Badge> : <Badge tone="danger">{closed ? mm.closed : mm.suspended}</Badge>}
            {data.blocks.length > 0 && <Badge tone="danger">{mb.blocked}</Badge>}
          </span>
        }
        description={fmt(mb.summary, { phone: user.phone ?? "-", date: formatDate(user.created_at, lang, "long"), ref: user.ref_code })}
      />
      {closed && (
        <p role="status" className="mb-6 rounded-card border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {fmt(mb.closedBanner, {
            time: user.closed_at ? formatDateTime(user.closed_at, lang) : "-",
            staff: user.closed_by_name ?? "-",
            reason: user.close_reason ?? "-",
          })}
        </p>
      )}
      {data.blocks.length > 0 && (
        <section role="status" className="mb-6 rounded-card border border-danger bg-danger-soft px-4 py-3 text-sm">
          <p className="font-semibold text-danger">{mb.blockedBanner}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {data.blocks.map((b) => {
              const value = b.kind === "bank" ? `${b.bankCode ? bankName(b.bankCode, d) : d.admin.people.blocklist.anyBank} ${b.display}` : b.display;
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink">
                    <span className="font-medium">
                      {d.admin.people.blocklist.kinds[b.kind]}: <span className="tnum">{value}</span>
                    </span>
                    <span className="block text-xs text-ink-2">
                      {fmt(mb.blockedBy, { reason: b.reason, staff: b.creator ?? "-", time: formatDateTime(b.createdAt, lang) })}
                    </span>
                  </span>
                  {data.can.block && <UnblockButton id={b.id} label={value} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
            <Figure label={mb.balance}>
              <Money satang={user.balance} />
            </Figure>
            <Figure
              label={mb.points}
              hint={
                data.pointRule.enabled
                  ? fmt(mb.pointsHint, { amount: formatBaht(data.pointRule.every, { decimals: "auto" }), n: data.pointRule.points.toLocaleString("en-US") })
                  : mb.pointsOff
              }
            >
              <span className="tnum">{data.points.toLocaleString("en-US")}</span>
            </Figure>
            <Figure label={mb.rewards}>
              <Money satang={user.cashback_balance} decimals="auto" /> / <Money satang={user.affiliate_balance} decimals="auto" />
            </Figure>
            <Figure label={mb.settled} hint={fmt(d.admin.shell.bills, { n: totals.bills })}>
              <Money satang={totals.stake} decimals="auto" />
            </Figure>
            <Figure label={mb.netResult} tone={totals.payout - totals.stake >= 0 ? "good" : "bad"}>
              <Money satang={totals.payout - totals.stake} sign decimals="auto" />
            </Figure>
          </dl>

          <section aria-labelledby="bills">
            <SectionTitle id="bills">{mb.bills}</SectionTitle>
            <Card className="divide-y divide-line">
              {bills.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>
                    <span className="block font-medium">
                      {b.lotto} <span className="font-normal text-ink-3">{b.label}</span>
                    </span>
                    <span className="tnum block text-xs text-ink-3">
                      {b.code} · {formatDateTime(b.created_at, lang)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Money
                      satang={b.status === "won" ? b.total_payout : b.total_stake}
                      decimals="auto"
                      className={b.status === "won" ? "font-semibold text-gold-text" : ""}
                    />
                    <Badge tone={BILL_TONE[b.status as BillStatus]}>{d.lotto.billStatus[b.status as BillStatus]}</Badge>
                  </span>
                </div>
              ))}
              {bills.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">{mb.noBills}</p>}
            </Card>
          </section>

          <section aria-labelledby="tx">
            <SectionTitle id="tx">{mb.tx}</SectionTitle>
            <Card className="divide-y divide-line">
              {tx.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>
                    <span className="block font-medium">
                      {d.lotto.tx[t.type as keyof typeof d.lotto.tx] ?? t.type}
                      {t.wallet !== "balance" && (
                        <span className="ml-1.5 text-xs text-ink-3">({t.wallet === "cashback" ? mb.cashbackWallet : mb.affiliateWallet})</span>
                      )}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {formatDateTime(t.created_at, lang)}
                      {t.note && STAFF_NOTE_TYPES.has(t.type) && ` · ${t.note}`}
                      {t.ref && <span className="tnum"> · {t.ref}</span>}
                    </span>
                  </span>
                  <Money satang={t.amount} sign className={t.amount > 0 ? "font-semibold text-success" : "font-semibold"} />
                </div>
              ))}
            </Card>
          </section>

          <section aria-labelledby="points">
            <SectionTitle id="points">{mb.pointsHistory}</SectionTitle>
            <Card className="overflow-x-auto">
              {data.pointMoves.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-3">{mb.noPointMoves}</p>
              ) : (
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-3">
                      <th className="px-4 py-2 font-medium">{mb.colTime}</th>
                      <th className="px-4 py-2 font-medium">{mb.colKind}</th>
                      <th className="px-4 py-2 font-medium">{mb.colStaff}</th>
                      <th className="px-4 py-2 text-right font-medium">{mb.colPoints}</th>
                      <th className="px-4 py-2 text-right font-medium">{mb.colPointsBalance}</th>
                      <th className="px-4 py-2 font-medium">{mb.colReason}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.pointMoves.map((p) => (
                      <tr key={p.id} className="align-top">
                        <td className="tnum px-4 py-2 whitespace-nowrap text-ink-2">{formatDateTime(p.created_at, lang)}</td>
                        <td className="px-4 py-2">
                          {mb.pointKinds[p.kind as keyof typeof mb.pointKinds] ?? p.kind}
                          {p.ref && <span className="tnum block text-xs text-ink-3">{p.ref}</span>}
                        </td>
                        <td className="px-4 py-2">{p.staff ?? "-"}</td>
                        <td className={`tnum px-4 py-2 text-right font-semibold ${p.amount > 0 ? "text-success" : "text-danger"}`}>
                          {p.amount > 0 ? "+" : ""}
                          {Number(p.amount).toLocaleString("en-US")}
                        </td>
                        <td className="tnum px-4 py-2 text-right whitespace-nowrap text-ink-2">
                          {p.before.toLocaleString("en-US")} → {Number(p.balance_after).toLocaleString("en-US")}
                        </td>
                        <td className="px-4 py-2 break-words text-ink-2">{p.note ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>

          <section aria-labelledby="member-games">
            <SectionTitle id="member-games">{d.admin.content.games.memberGames}</SectionTitle>
            <Card className="divide-y divide-line">
              {data.games.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{g.game}</span>
                    <span className="block text-xs text-ink-3">
                      {g.product} · {formatDateTime(g.at, lang)} · {g.status}
                    </span>
                  </span>
                  <span className="text-right">
                    <Money satang={g.net} sign decimals="auto" className={g.net > 0 ? "font-semibold text-success" : "font-semibold"} />
                    <span className="tnum block text-xs text-ink-3">
                      <Money satang={g.bet} decimals="auto" /> → <Money satang={g.payout} decimals="auto" />
                    </span>
                  </span>
                </div>
              ))}
              {data.games.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">{d.admin.content.games.noMemberGames}</p>}
            </Card>
          </section>

          <section aria-labelledby="adjustments">
            <SectionTitle id="adjustments">{mb.adjustHistory}</SectionTitle>
            <Card className="overflow-x-auto">
              {adjustments.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-3">{mb.noAdjustments}</p>
              ) : (
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-3">
                      <th className="px-4 py-2 font-medium">{mb.colTime}</th>
                      <th className="px-4 py-2 font-medium">{mb.colStaff}</th>
                      <th className="px-4 py-2 text-right font-medium">{mb.colAmount}</th>
                      <th className="px-4 py-2 text-right font-medium">{mb.colBalance}</th>
                      <th className="px-4 py-2 font-medium">{mb.colReason}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {adjustments.map((a) => (
                      <tr key={a.id} className="align-top">
                        <td className="tnum px-4 py-2 whitespace-nowrap text-ink-2">{formatDateTime(a.created_at, lang)}</td>
                        <td className="px-4 py-2">{a.staff ?? "-"}</td>
                        <td className="px-4 py-2 text-right">
                          <Money satang={a.amount} sign className={a.amount > 0 ? "font-semibold text-success" : "font-semibold text-danger"} />
                        </td>
                        <td className="tnum px-4 py-2 text-right whitespace-nowrap text-ink-2">
                          <Money satang={a.before} /> → <Money satang={a.balance_after} />
                        </td>
                        <td className="px-4 py-2 break-words text-ink-2">{a.note ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="p-5 text-sm">
            <h2 className="mb-2 font-semibold">{mb.payout}</h2>
            <p>{bankName(user.bank_code, d)}</p>
            <p className="tnum font-semibold tracking-[0.04em]">{user.bank_account ?? "-"}</p>
            <p className="text-ink-2">{user.bank_name}</p>
            {upline && (
              <p className="mt-3 text-ink-2">
                {mb.upline}{" "}
                <Link href={`/members/${upline.id}`} className="font-semibold text-brand hover:underline">
                  {upline.name} ({upline.phone})
                </Link>
              </p>
            )}
            {user.turnover_required > 0 && (
              <p className="mt-3 text-warning">
                {mb.turnoverLeft} <Money satang={user.turnover_required} className="font-semibold" />
              </p>
            )}
          </Card>
          {!closed && (
            <Card className="p-5">
              <MemberActions
                userId={user.id}
                status={user.status}
                balance={user.balance}
                pointRule={data.pointRule}
                canAdjust={data.can.adjust}
                canManage={data.can.manage}
              />
            </Card>
          )}
          {data.can.points && !closed && (
            <Card className="p-5">
              <MemberPointsForm userId={user.id} points={data.points} />
            </Card>
          )}
          {data.can.edit && !closed && (
            <Card className="p-5">
              <MemberEditForm
                userId={user.id}
                showContact={data.can.contact}
                current={{ name: user.name, phone: user.phone, bankCode: user.bank_code, bankAccount: user.bank_account, bankName: user.bank_name }}
              />
            </Card>
          )}
          {data.can.block && !closed && (
            <Card className="p-5">
              <MemberBlockForm userId={user.id} />
            </Card>
          )}
          {data.can.close && (
            <Card className="p-5">
              <MemberCloseForm userId={user.id} closed={closed} />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

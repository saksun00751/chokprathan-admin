import Link from "next/link";
import { Suspense } from "react";
import { ReviewButtons } from "@/components/admin/forms";
import { Table, Td, Th } from "@/components/admin/ui";
import { Badge, Money, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { fmt, formatDateTime } from "@/i18n/format";
import { bankName, bankShort } from "@/i18n/labels";
import { getI18n, titled } from "@/i18n/rsc";
import { getFinanceQueues } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.people.finance.title);

export default async function AdminFinancePage() {
  const f = (await getI18n()).t.admin.people.finance;
  return (
    <>
      <PageHeader title={f.title} description={f.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <FinanceBody />
      </Suspense>
    </>
  );
}

function Who({ id, user, blockedLabel }: { id: number; user: { phone: string | null; name: string; blocked?: boolean }; blockedLabel: string }) {
  return (
    <Link href={`/members/${id}`} className="block font-medium hover:text-brand">
      {user.name}
      {/* On the blocklist: check before approving or paying anything. */}
      {user.blocked && (
        <Badge tone="danger" className="ml-1.5">
          {blockedLabel}
        </Badge>
      )}
      <span className="tnum block text-xs font-normal text-ink-3">{user.phone}</span>
    </Link>
  );
}

async function FinanceBody() {
  const [q, { lang, t }] = await Promise.all([getFinanceQueues(), getI18n()]);
  const f = t.admin.people.finance;
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="dep">
        <SectionTitle id="dep">{fmt(f.deposits, { n: q.deposits.length })}</SectionTitle>
        <Table minWidth={720}>
          <thead>
            <tr>
              <Th>{f.member}</Th>
              <Th>{f.from}</Th>
              <Th>{f.notifiedAt}</Th>
              <Th align="right">{f.expected}</Th>
              <Th align="right">{f.action}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {q.deposits.map((d) => (
              <tr key={d.id}>
                <Td>
                  <Who id={d.user_id} user={d.user} blockedLabel={t.admin.people.member.blocked} />
                </Td>
                <Td className="text-ink-2">
                  {bankShort(d.user.bank_code, t)} <span className="tnum">{d.user.bank_account}</span>
                </Td>
                <Td className="whitespace-nowrap">
                  {formatDateTime(d.confirmed_at ?? d.created_at, lang)}
                  {d.slip ? (
                    <a href={`/media/${d.slip}`} target="_blank" rel="noreferrer" className="block text-xs font-semibold text-brand hover:underline">
                      {f.slip}
                    </a>
                  ) : (
                    <span className="block text-xs text-ink-3">{f.noSlip}</span>
                  )}
                </Td>
                <Td align="right">
                  <Money satang={d.amount} className="font-semibold" />
                  {d.promotion_id && <span className="block text-xs text-ink-3">{f.promo}</span>}
                </Td>
                <Td align="right">
                  {q.can.deposit ? (
                    <ReviewButtons
                      kind="deposit"
                      id={d.id}
                      summary={{
                        member: `${d.user.name} ${d.user.phone ?? ""}`.trim(),
                        amount: d.amount,
                        account: `${bankShort(d.user.bank_code, t)} ${d.user.bank_account ?? ""}`.trim(),
                      }}
                    />
                  ) : (
                    <span className="text-xs text-ink-3">{f.noPermission}</span>
                  )}
                </Td>
              </tr>
            ))}
            {q.deposits.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-3">
                  {f.noDeposits}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      <section aria-labelledby="wd">
        <SectionTitle id="wd">{fmt(f.withdrawals, { n: q.withdrawals.length })}</SectionTitle>
        <Table minWidth={720}>
          <thead>
            <tr>
              <Th>{f.member}</Th>
              <Th>{f.toAccount}</Th>
              <Th>{f.requestedAt}</Th>
              <Th align="right">{f.amount}</Th>
              <Th align="right">{f.action}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {q.withdrawals.map((w) => (
              <tr key={w.id}>
                <Td>
                  <Who id={w.user_id} user={w.user} blockedLabel={t.admin.people.member.blocked} />
                </Td>
                <Td>
                  <span className="block">{bankName(w.bank_code, t)}</span>
                  <span className="tnum block text-xs text-ink-3">
                    {w.bank_account} · {w.bank_name}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">{formatDateTime(w.created_at, lang)}</Td>
                <Td align="right">
                  <Money satang={w.amount} className="font-semibold" />
                </Td>
                <Td align="right">
                  {q.can.withdraw ? (
                    <ReviewButtons
                      kind="withdraw"
                      id={w.id}
                      summary={{
                        member: `${w.user.name} ${w.user.phone ?? ""}`.trim(),
                        amount: w.amount,
                        account: `${bankName(w.bank_code, t)} ${w.bank_account} · ${w.bank_name}`,
                      }}
                      payFrom={q.payFrom.map((a) => ({ id: a.id, label: `${bankShort(a.bankCode, t)} ${a.accountNo.slice(-4)} · ${a.accountName}` }))}
                    />
                  ) : (
                    <span className="text-xs text-ink-3">{f.noPermission}</span>
                  )}
                </Td>
              </tr>
            ))}
            {q.withdrawals.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-3">
                  {f.noWithdrawals}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      <section aria-labelledby="hist" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle id="hist">{f.doneDeposits}</SectionTitle>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface text-sm">
            {q.recentDeposits.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  {d.user.name}
                  <span className="block text-xs text-ink-3">{d.reviewed_at ? formatDateTime(d.reviewed_at, lang) : "-"}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Money satang={d.amount} />
                  <Badge tone={d.status === "approved" ? "success" : "danger"}>{d.status === "approved" ? f.approved : f.rejected}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle>{f.doneWithdrawals}</SectionTitle>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface text-sm">
            {q.recentWithdrawals.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  {w.user.name}
                  <span className="block text-xs text-ink-3">{w.reviewed_at ? formatDateTime(w.reviewed_at, lang) : "-"}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Money satang={w.amount} />
                  <Badge tone={w.status === "approved" ? "success" : "danger"}>{w.status === "approved" ? f.paid : f.rejected}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

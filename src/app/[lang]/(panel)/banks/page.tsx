import Link from "next/link";
import { Suspense } from "react";
import { AddBankAccount, BankAccountTools } from "@/components/admin/bank-accounts";
import { Badge, Card, Money, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { fmt, formatDateTime } from "@/i18n/format";
import { bankName, bankShort } from "@/i18n/labels";
import { getI18n, titled } from "@/i18n/rsc";
import { getBanksPage } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.content.banks.title);

export default async function AdminBanksPage({ searchParams }: PageProps<"/[lang]/banks">) {
  const b = (await getI18n()).t.admin.content.banks;
  return (
    <>
      <PageHeader title={b.title} description={b.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <BanksBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function BanksBody({ searchParams }: Pick<PageProps<"/[lang]/banks">, "searchParams">) {
  const sp = await searchParams;
  const selected = Number(Array.isArray(sp.account) ? sp.account[0] : sp.account) || undefined;
  const [data, { lang, t }] = await Promise.all([getBanksPage(selected), getI18n()]);
  const b = t.admin.content.banks;
  const groups = (["deposit", "withdraw"] as const).map((kind) => ({ kind, accounts: data.accounts.filter((a) => a.kind === kind) }));
  return (
    <div className="flex flex-col gap-8">
      {data.can.manage && <AddBankAccount />}
      {groups.map(({ kind, accounts }) => (
        <section key={kind} aria-labelledby={`banks-${kind}`}>
          <SectionTitle id={`banks-${kind}`}>
            {kind === "deposit" ? b.deposit : b.withdraw}
            <span className="ml-2 text-sm font-normal text-ink-3">
              {b.total} <Money satang={accounts.filter((a) => a.archivedAt === null).reduce((s, a) => s + a.balance, 0)} />
            </span>
          </SectionTitle>
          {accounts.length === 0 ? (
            <Card className="px-4 py-6 text-center text-sm text-ink-3">{b.none}</Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {accounts.map((a) => (
                <Card key={a.id} className={`flex flex-col gap-3 p-4 ${a.id === data.current?.id ? "ring-2 ring-brand" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {bankName(a.bankCode, t)}
                        {!a.active && a.archivedAt === null && <Badge tone="neutral" className="ml-2">{b.inactive}</Badge>}
                        {a.archivedAt !== null && <Badge tone="danger" className="ml-2">{b.archived}</Badge>}
                      </p>
                      <p className="tnum text-sm tracking-[0.04em]">{a.accountNo}</p>
                      <p className="truncate text-sm text-ink-2">{a.accountName}</p>
                      {a.note && <p className="mt-1 text-xs text-ink-3">{a.note}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-ink-3">{b.balance}</p>
                      <Money satang={a.balance} className={`text-lg font-semibold ${a.balance < 0 ? "text-danger" : ""}`} />
                    </div>
                  </div>
                  {a.balance < 0 && <p className="text-xs text-danger">{b.negative}</p>}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link href={`/banks?account=${a.id}#history`} className="text-sm font-medium text-brand hover:underline">
                      {b.viewHistory}
                    </Link>
                  </div>
                  {a.archivedAt === null && (data.can.manage || data.can.adjust) && (
                    <BankAccountTools
                      account={{ id: a.id, kind: a.kind, bankCode: a.bankCode, accountNo: a.accountNo, accountName: a.accountName, active: a.active, sort: a.sort, note: a.note, balance: a.balance }}
                      canManage={data.can.manage}
                      canAdjust={data.can.adjust}
                    />
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      ))}

      {data.current && (
        <section id="history" aria-labelledby="banks-history">
          <SectionTitle id="banks-history">
            {fmt(b.history, { account: `${bankShort(data.current.bankCode, t)} ${data.current.accountNo}` })}
          </SectionTitle>
          <Card className="overflow-x-auto">
            {data.moves.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-3">{b.noMoves}</p>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-3">
                    <th className="px-4 py-2 font-medium">{b.colTime}</th>
                    <th className="px-4 py-2 font-medium">{b.colKind}</th>
                    <th className="px-4 py-2 font-medium">{b.colRef}</th>
                    <th className="px-4 py-2 text-right font-medium">{b.colAmount}</th>
                    <th className="px-4 py-2 text-right font-medium">{b.colBalance}</th>
                    <th className="px-4 py-2 font-medium">{b.colStaff}</th>
                    <th className="px-4 py-2 font-medium">{b.colNote}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.moves.map((m) => (
                    <tr key={m.id} className="align-top">
                      <td className="tnum px-4 py-2 whitespace-nowrap text-ink-2">{formatDateTime(Number(m.created_at), lang)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{b.kinds[m.kind]}</td>
                      <td className="tnum px-4 py-2 text-ink-2">{m.ref ?? "-"}</td>
                      <td className="px-4 py-2 text-right">
                        <Money satang={Number(m.amount)} sign className={Number(m.amount) > 0 ? "font-semibold text-success" : "font-semibold"} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Money satang={Number(m.balance_after)} className={Number(m.balance_after) < 0 ? "text-danger" : ""} />
                      </td>
                      <td className="px-4 py-2">{m.staff ?? "-"}</td>
                      <td className="px-4 py-2 break-words text-ink-2">{m.note ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}

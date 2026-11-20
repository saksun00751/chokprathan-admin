import Link from "next/link";
import { Suspense } from "react";
import { Table, Td, Th } from "@/components/admin/ui";
import { Badge, Money, PageHeader, Skeleton } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getMembers } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.people.members.title);

export default async function AdminMembersPage({ searchParams }: PageProps<"/[lang]/members">) {
  const m = (await getI18n()).t.admin.people.members;
  return (
    <>
      <PageHeader title={m.title} description={m.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <MembersBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MembersBody({ searchParams }: Pick<PageProps<"/[lang]/members">, "searchParams">) {
  const { q } = await searchParams;
  const search = typeof q === "string" ? q : "";
  const [members, { lang, t }] = await Promise.all([getMembers(search), getI18n()]);
  const mm = t.admin.people.members;
  return (
    <>
      <form method="get" className="mb-5 flex gap-2">
        <input name="q" defaultValue={search} placeholder={mm.search} className="h-11 w-full max-w-md rounded-control border border-line-strong bg-surface px-3" />
        <button type="submit" className="h-11 rounded-control bg-ink px-4 text-sm font-semibold text-white">
          {mm.searchButton}
        </button>
      </form>
      <Table minWidth={760}>
        <thead>
          <tr>
            <Th>{mm.member}</Th>
            <Th>{mm.status}</Th>
            <Th align="right">{mm.balance}</Th>
            <Th align="right">{mm.turnover}</Th>
            <Th>{mm.joined}</Th>
            <Th>{mm.lastLogin}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {members.map((m) => (
            <tr key={m.id} className="hover:bg-panel">
              <Td>
                <Link href={`/members/${m.id}`} className="block font-medium hover:text-brand">
                  {m.name || "-"}
                  <span className="tnum block text-xs font-normal text-ink-3">{m.phone ?? "-"}</span>
                </Link>
              </Td>
              <Td>
                {m.status === "active" ? <Badge tone="success">{mm.active}</Badge> : <Badge tone="danger">{m.status === "closed" ? mm.closed : mm.suspended}</Badge>}
              </Td>
              <Td align="right">
                <Money satang={m.balance} />
              </Td>
              <Td align="right">
                <Money satang={m.bets ?? 0} decimals="auto" />
              </Td>
              <Td className="whitespace-nowrap">{formatDate(m.created_at, lang)}</Td>
              <Td className="whitespace-nowrap text-ink-2">{m.last_login_at ? formatDateTime(m.last_login_at, lang) : "-"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

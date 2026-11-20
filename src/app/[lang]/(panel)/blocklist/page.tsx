import Link from "next/link";
import { Search } from "lucide-react";
import { Suspense } from "react";
import { BlockAddForm, UnblockButton } from "@/components/admin/blocklist";
import { Table, Td, Th } from "@/components/admin/ui";
import { Badge, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { isBlockKind, type BlockKind } from "@/domain/blocklist";
import type { Dict } from "@/i18n/dictionaries";
import { fmt, formatDateTime } from "@/i18n/format";
import { bankShort } from "@/i18n/labels";
import { getI18n, titled } from "@/i18n/rsc";
import { getBlocklistPage } from "@/server/data/admin";
import type { BlockRow } from "@/server/services/blocklist";

export const generateMetadata = () => titled((t) => t.admin.people.blocklist.title);

const TONE = { bank: "brand", phone: "warning", name: "outline" } as const;

export default async function AdminBlocklistPage({ searchParams }: PageProps<"/[lang]/blocklist">) {
  const bl = (await getI18n()).t.admin.people.blocklist;
  return (
    <>
      <PageHeader title={bl.title} description={bl.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <BlocklistBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** How an entry reads: "กสิกรไทย 1234567890", "ทุกธนาคาร 1234567890", a phone, or a name. */
const valueOf = (b: Pick<BlockRow, "kind" | "bank_code" | "display">, t: Dict) =>
  b.kind === "bank" ? `${b.bank_code ? bankShort(b.bank_code, t) : t.admin.people.blocklist.anyBank} ${b.display}` : b.display;

async function BlocklistBody({ searchParams }: Pick<PageProps<"/[lang]/blocklist">, "searchParams">) {
  const sp = await searchParams;
  const kind = isBlockKind(one(sp.kind)) ? (one(sp.kind) as BlockKind) : undefined;
  const search = one(sp.q)?.trim() ?? "";
  const [data, { lang, t }] = await Promise.all([getBlocklistPage({ kind, search }), getI18n()]);
  const bl = t.admin.people.blocklist;
  const link = (k?: BlockKind) =>
    `/blocklist${k || search ? `?${new URLSearchParams({ ...(k ? { kind: k } : {}), ...(search ? { q: search } : {}) })}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      {!data.ready && <p className="rounded-card border border-warning bg-warning-soft px-4 py-3 text-sm">{bl.notReady}</p>}
      <BlockAddForm />

      <section aria-labelledby="active">
        <SectionTitle id="active">{fmt(bl.count, { n: data.active.length })}</SectionTitle>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {([undefined, "bank", "phone", "name"] as const).map((k) => (
            <Link
              key={k ?? "all"}
              href={link(k)}
              aria-current={kind === k ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium ${kind === k ? "bg-ink text-white" : "bg-panel text-ink-2 hover:bg-line"}`}
            >
              {k ? bl.kinds[k] : bl.all}
            </Link>
          ))}
          <form action="/blocklist" className="ml-auto flex gap-2">
            {kind && <input type="hidden" name="kind" value={kind} />}
            <input
              name="q"
              defaultValue={search}
              placeholder={bl.searchPlaceholder}
              aria-label={bl.search}
              className="h-9 w-64 rounded-control border border-line-strong bg-surface px-3 text-sm"
            />
            <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-control bg-panel px-3 text-sm font-medium hover:bg-line">
              <Search className="size-4" aria-hidden="true" />
              {bl.search}
            </button>
          </form>
        </div>
        <Table minWidth={820}>
          <thead>
            <tr>
              <Th>{bl.colKind}</Th>
              <Th>{bl.colValue}</Th>
              <Th>{bl.colReason}</Th>
              <Th>{bl.colBy}</Th>
              <Th align="right">{bl.colAction}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.active.map((b) => (
              <tr key={b.id} className="align-top">
                <Td>
                  <Badge tone={TONE[b.kind]}>{bl.kinds[b.kind]}</Badge>
                </Td>
                <Td className="tnum font-medium">{valueOf(b, t)}</Td>
                <Td className="max-w-72 break-words text-ink-2">{b.reason}</Td>
                <Td className="whitespace-nowrap text-ink-2">
                  {b.creator ?? "-"}
                  <span className="block text-xs text-ink-3">{formatDateTime(b.created_at, lang)}</span>
                </Td>
                <Td align="right">
                  <span className="inline-flex flex-wrap justify-end gap-1.5">
                    <Link
                      href={`/members?q=${encodeURIComponent(b.kind === "name" ? b.display.split(" ").at(-1)! : b.display)}`}
                      className="inline-flex h-8 items-center rounded-control px-2.5 text-sm font-medium text-brand hover:bg-panel"
                    >
                      {bl.findMembers}
                    </Link>
                    <UnblockButton id={b.id} label={valueOf(b, t)} />
                  </span>
                </Td>
              </tr>
            ))}
            {data.active.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-ink-3">
                  {search || kind ? bl.noResults : bl.empty}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      {data.removed.length > 0 && (
        <details className="rounded-card border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{fmt(bl.removedTitle, { n: data.removed.length })}</summary>
          <ul className="divide-y divide-line border-t border-line">
            {data.removed.map((b) => (
              <li key={b.id} className="px-4 py-2.5 text-sm">
                <span className="font-medium">
                  {bl.kinds[b.kind]}: <span className="tnum">{valueOf(b, t)}</span>
                </span>
                <span className="block text-xs text-ink-3">
                  {fmt(bl.removedBy, { staff: b.remover ?? "-", time: formatDateTime(b.removed_at ?? 0, lang), reason: b.remove_reason ?? "-" })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

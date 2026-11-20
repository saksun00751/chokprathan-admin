import { Suspense } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Table, Td, Th } from "@/components/admin/ui";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { fmt, formatDateTime, formatNumber } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getAudit, getAuditIntegrity } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.people.audit.title);

export default async function AdminAuditPage() {
  const a = (await getI18n()).t.admin.people.audit;
  return (
    <>
      <PageHeader title={a.title} description={a.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <AuditBody />
      </Suspense>
    </>
  );
}

/** Edits are stored as { before, after }: show only what changed. */
function Changes({ detail }: { detail: unknown }) {
  const d = detail as { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  if (d && typeof d === "object" && d.before && d.after) {
    const show = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v));
    return (
      <ul className="flex max-w-md flex-col gap-0.5 text-xs">
        {Object.keys(d.after).map((k) => (
          <li key={k} className="break-all">
            <span className="text-ink-3">{k}: </span>
            <span className="text-danger line-through decoration-1">{show(d.before![k])}</span>
            <span className="text-ink-3"> → </span>
            <span className="font-medium text-ink">{show(d.after![k])}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <code className="line-clamp-2 max-w-md text-xs break-all text-ink-3">{detail ? JSON.stringify(detail) : ""}</code>;
}

async function AuditBody() {
  const [rows, integrity, { lang, t }] = await Promise.all([getAudit(), getAuditIntegrity(), getI18n()]);
  const a = t.admin.people.audit;
  return (
    <>
      {integrity === null ? (
        <p className="mb-4 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-2">{a.integrityPending}</p>
      ) : integrity.ok ? (
        <p className="mb-4 flex items-start gap-2 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span>
            {fmt(a.integrityOk, { n: formatNumber(integrity.checked), time: formatDateTime(integrity.at, lang) })}
            {integrity.unsealed > 0 && <span className="block text-xs text-ink-3">{fmt(a.unsealed, { n: integrity.unsealed })}</span>}
          </span>
        </p>
      ) : (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-card border border-danger bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {fmt(a.integrityBroken, { seq: integrity.seq, reason: a.reasons[integrity.reason], time: formatDateTime(integrity.at, lang) })}
        </p>
      )}
      <Table minWidth={860}>
        <thead>
          <tr>
            <Th>{a.time}</Th>
            <Th>{a.actor}</Th>
            <Th>{a.action}</Th>
            <Th>{a.target}</Th>
            <Th>{a.detail}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <Td className="tnum whitespace-nowrap">
                {formatDateTime(r.created_at, lang)}
                <span className="block text-xs text-ink-3">{r.seq ? fmt(a.sealed, { seq: r.seq }) : a.waiting}</span>
              </Td>
              <Td>
                {r.actor ?? a.system}
                {r.ip && <span className="tnum block text-xs text-ink-3">{r.ip}</span>}
                {r.ua && (
                  <span className="block max-w-48 truncate text-xs text-ink-3" title={r.ua}>
                    {r.ua}
                  </span>
                )}
              </Td>
              <Td className={`font-medium whitespace-nowrap ${r.action === "denied" ? "text-danger" : ""}`}>{a.actions[r.action] ?? r.action}</Td>
              <Td className="tnum text-ink-2">{r.target ?? "-"}</Td>
              <Td>
                <Changes detail={r.detail} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

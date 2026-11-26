import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Suspense } from "react";
import { PeriodFilter } from "@/components/admin/period-filter";
import { Table, Td, Th } from "@/components/admin/ui";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { formatBaht } from "@/core/rules/money";
import { rangeLabel } from "@/domain/periods";
import type { Locale } from "@/i18n/config";
import { fmt, formatDate, formatDateTime, formatNumber } from "@/i18n/format";
import { getI18n } from "@/i18n/rsc";
import { cn } from "@/lib/cn";
import { getReport, isReportId, type ReportCell, type ReportColumn } from "@/server/data/reports";

export async function generateMetadata({ params }: PageProps<"/[lang]/reports/[report]">): Promise<Metadata> {
  const [{ report }, { t }] = await Promise.all([params, getI18n()]);
  return { title: isReportId(report) ? t.admin.reports.list[report].title : t.admin.reports.title };
}

export default function ReportPage({ params, searchParams }: PageProps<"/[lang]/reports/[report]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] rounded-card" />}>
      <ReportBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const numeric = (k: ReportColumn["kind"]) => k === "int" || k === "baht" || k === "pct";

function show(value: ReportCell, kind: ReportColumn["kind"], lang: Locale) {
  if (value === null || value === undefined || value === "") return "-";
  switch (kind) {
    case "baht":
      return formatBaht(Number(value), { decimals: "auto" });
    case "int":
      return formatNumber(Number(value));
    case "pct":
      return `${(Number(value) * 100).toFixed(1)}%`;
    case "date":
      return formatDate(Number(value), lang);
    case "datetime":
      return formatDateTime(Number(value), lang);
    default:
      return String(value);
  }
}

async function ReportBody({ params, searchParams }: { params: PageProps<"/[lang]/reports/[report]">["params"]; searchParams: PageProps<"/[lang]/reports/[report]">["searchParams"] }) {
  const { report } = await params;
  if (!isReportId(report)) notFound();
  const sp = await searchParams;
  const input = { period: one(sp.period), from: one(sp.from), to: one(sp.to) };
  const [{ meta, range, table, totals, canExport }, { lang, t }] = await Promise.all([getReport(report, input), getI18n()]);
  const rp = t.admin.reports;
  const per = t.admin.shell.period;
  const query = new URLSearchParams(range.period === "custom" ? { from: range.from, to: range.to } : { period: range.period });
  return (
    <>
      <PageHeader
        back={{ href: "/reports", label: rp.title }}
        title={meta.title}
        description={meta.description}
        actions={
          canExport ? (
            <a
              href={`/reports/${report}/export?${query}`}
              className="inline-flex h-10 items-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-panel"
              download
            >
              <Download className="size-4" aria-hidden="true" />
              {rp.download}
            </a>
          ) : null
        }
      />
      <PeriodFilter basePath={`/reports/${report}`} range={range} />
      <p className="-mt-4 mb-4 text-sm text-ink-2">
        {rangeLabel(range, per)} · {range.from === range.to ? formatDate(range.startMs, lang, "long") : fmt(per.range, { from: formatDate(range.startMs, lang), to: formatDate(range.endMs - 1, lang) })} ·{" "}
        {fmt(rp.rows, { n: formatNumber(table.rows.length) })}
        {table.truncated && rp.truncated}
      </p>
      <Table minWidth={Math.max(640, table.columns.length * 110)}>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <Th key={c.key} align={numeric(c.kind) ? "right" : "left"}>
                {c.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {table.rows.length === 0 && (
            <tr>
              <td colSpan={table.columns.length} className="px-3 py-8 text-center text-ink-3">
                {rp.empty}
              </td>
            </tr>
          )}
          {table.rows.map((row, i) => (
            <tr key={i} className="hover:bg-panel">
              {table.columns.map((c) => {
                const v = row[c.key];
                const negative = c.kind === "baht" && Number(v) < 0;
                return (
                  <Td key={c.key} align={numeric(c.kind) ? "right" : "left"} className={cn(numeric(c.kind) && "tnum whitespace-nowrap", (c.kind === "date" || c.kind === "datetime") && "whitespace-nowrap", negative && "text-danger")}>
                    {show(v, c.kind, lang)}
                  </Td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {Object.keys(totals).length > 0 && table.rows.length > 1 && (
          <tfoot className="border-t-2 border-line-strong bg-panel font-semibold">
            <tr>
              {table.columns.map((c, i) => (
                <Td key={c.key} align={numeric(c.kind) ? "right" : "left"} className={cn(numeric(c.kind) && "tnum whitespace-nowrap", c.kind === "baht" && totals[c.key] < 0 && "text-danger")}>
                  {c.key in totals ? show(totals[c.key], c.kind, lang) : i === 0 ? rp.total : ""}
                </Td>
              ))}
            </tr>
          </tfoot>
        )}
      </Table>
      {table.note && <p className="mt-3 max-w-[80ch] text-sm text-ink-3">{table.note}</p>}
    </>
  );
}

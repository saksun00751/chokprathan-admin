import { connection } from "next/server";
import { serverI18n } from "@/i18n/server";
import { toCsv } from "@/server/csv";
import { getReport, isReportId } from "@/server/data/reports";
import { audit } from "@/server/services/audit";
import { can } from "@/server/services/employee-auth";
import { employeeFor, getEmployee } from "@/server/session";

/**
 * CSV download of a report. Needs an employee session with reports.export, under the same
 * rules as every back-office action; every export is written to the audit log.
 */
export async function GET(request: Request, { params }: RouteContext<"/[lang]/reports/[report]/export">) {
  await connection();
  if (!(await getEmployee())) return new Response("Not found", { status: 404 });
  const viewer = await employeeFor("reports.export");
  if (!viewer) return new Response("Forbidden", { status: 403 });
  const { report } = await params;
  if (!isReportId(report)) return new Response("Not found", { status: 404 });
  if (report === "staff" && !can(viewer, "audit.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const input = {
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };
  const { range, table } = await getReport(report, input, { forExport: true });
  await audit(viewer.id, "report.export", report, { from: range.from, to: range.to, rows: table.rows.length });
  const { t } = await serverI18n();
  return new Response(toCsv(table.columns, table.rows, t.admin.reports.bahtUnit), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${report}-${range.from}-${range.to}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
import { REPORTS } from "@/server/data/reports";
import { requireEmployee } from "@/server/session";

export const generateMetadata = () => titled((t) => t.admin.reports.title);

export default async function ReportsIndex() {
  const rp = (await getI18n()).t.admin.reports;
  return (
    <>
      <PageHeader title={rp.title} description={rp.description} />
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <ReportList />
      </Suspense>
    </>
  );
}

async function ReportList() {
  const [, { t }] = await Promise.all([requireEmployee("reports.view"), getI18n()]);
  return (
    <Card className="divide-y divide-line">
      {REPORTS.map((id) => (
        <Link key={id} href={`/reports/${id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-panel">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">{t.admin.reports.list[id].title}</span>
            <span className="block text-sm text-ink-2">{t.admin.reports.list[id].description}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
        </Link>
      ))}
    </Card>
  );
}

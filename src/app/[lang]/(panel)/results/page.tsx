import { CheckCircle2 } from "lucide-react";
import { Suspense } from "react";
import { BulkResults } from "@/components/admin/bulk-results";
import { Card, EmptyState, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { fmt } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getAwaitingResults } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.ops.results.title);

export default async function ResultsPage() {
  const r = (await getI18n()).t.admin.ops.results;
  return (
    <>
      <PageHeader title={r.title} description={r.description} />
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  const [{ rounds, groups }, { t }] = await Promise.all([getAwaitingResults(), getI18n()]);
  if (rounds.length === 0) {
    return (
      <Card>
        <EmptyState icon={<CheckCircle2 className="size-6" aria-hidden="true" />} title={t.admin.ops.results.emptyTitle} description={t.admin.ops.results.emptyBody} />
      </Card>
    );
  }
  return (
    <section aria-labelledby="to-enter">
      <SectionTitle id="to-enter">{fmt(t.admin.ops.confirmResult.enterHeading, { n: rounds.length })}</SectionTitle>
      <BulkResults rows={rounds} groups={groups} />
    </section>
  );
}

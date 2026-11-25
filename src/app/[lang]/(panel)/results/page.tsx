import { CheckCircle2 } from "lucide-react";
import { Suspense } from "react";
import { BulkResults } from "@/components/admin/bulk-results";
import { ConfirmResult } from "@/components/admin/confirm-result";
import { Flag } from "@/components/ui/flag";
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
  const [{ rounds, pending, canConfirm }, { t }] = await Promise.all([getAwaitingResults(), getI18n()]);
  const c = t.admin.ops.confirmResult;
  if (rounds.length === 0 && pending.length === 0) {
    return (
      <Card>
        <EmptyState icon={<CheckCircle2 className="size-6" aria-hidden="true" />} title={t.admin.ops.results.emptyTitle} description={t.admin.ops.results.emptyBody} />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {pending.length > 0 && (
        <section aria-labelledby="to-confirm">
          <SectionTitle id="to-confirm">{fmt(c.heading, { n: pending.length })}</SectionTitle>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {pending.map((r) => (
              <li key={r.id}>
                <Card className="p-5">
                  <p className="mb-2 flex items-center gap-2 font-semibold">
                    <Flag code={r.flag} className="size-6" />
                    {r.shortName} <span className="font-normal text-ink-2">{r.label}</span>
                    {r.late && <span className="text-xs font-semibold text-danger">{c.late}</span>}
                  </p>
                  <ConfirmResult
                    roundId={r.id}
                    format={r.format}
                    round={`${r.lotto} ${r.label}`}
                    enteredBy={r.enteredBy}
                    enteredAt={r.enteredAt}
                    mine={r.mine}
                    canConfirm={canConfirm}
                    // Only people who may type results can have typed one, so a withdrawal is theirs to make.
                    canEnter={r.mine}
                  />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rounds.length > 0 && (
        <section aria-labelledby="to-enter">
          <SectionTitle id="to-enter">{fmt(c.enterHeading, { n: rounds.length })}</SectionTitle>
          <BulkResults rows={rounds} />
        </section>
      )}
    </div>
  );
}

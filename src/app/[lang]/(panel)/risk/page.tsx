import { Suspense } from "react";
import { RiskEditor } from "@/components/admin/risk-editor";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
import { DEFAULT_LIMITS, DEFAULT_RATES, DEFAULT_RISK } from "@/server/catalog";
import { getRiskSettings } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.shell.items.risk);

export default async function AdminRiskPage() {
  const r = (await getI18n()).t.admin.ops.risk;
  return (
    <>
      <PageHeader title={r.title} description={r.description} />
      <Suspense fallback={<Skeleton className="h-[720px] rounded-card" />}>
        <RiskBody />
      </Suspense>
    </>
  );
}

async function RiskBody() {
  const { rates, risk, limits } = await getRiskSettings();
  // Plain data (numbers, arrays, objects) so it serializes into the client component.
  const defaults = { rates: DEFAULT_RATES, risk: DEFAULT_RISK, limits: DEFAULT_LIMITS };
  return <RiskEditor rates={rates} risk={risk} limits={limits} defaults={defaults} />;
}

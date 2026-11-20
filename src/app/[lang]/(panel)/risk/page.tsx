import { Suspense } from "react";
import { RiskEditor } from "@/components/admin/risk-editor";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
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
  return <RiskEditor rates={rates} risk={risk} limits={limits} />;
}

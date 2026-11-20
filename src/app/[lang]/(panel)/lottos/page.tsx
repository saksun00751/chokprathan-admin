import { Suspense } from "react";
import { LottoList } from "@/components/admin/lotto-editor";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
import { getAdminLottos, getRiskSettings } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.ops.lottos.title);

export default async function AdminLottosPage() {
  const l = (await getI18n()).t.admin.ops.lottos;
  return (
    <>
      <PageHeader title={l.title} description={l.description} />
      <Suspense fallback={<Skeleton className="h-[640px] rounded-card" />}>
        <LottosBody />
      </Suspense>
    </>
  );
}

async function LottosBody() {
  const [lottos, { rates, risk }] = await Promise.all([getAdminLottos(), getRiskSettings()]);
  return <LottoList lottos={lottos} rates={rates} risk={risk} />;
}

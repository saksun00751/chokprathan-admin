import { Suspense } from "react";
import { AddLotto } from "@/components/admin/add-lotto";
import { LottoList } from "@/components/admin/lotto-editor";
import { LottoGroups } from "@/components/admin/lotto-groups";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
import { getAdminLottoGroups, getAdminLottos, getRiskSettings } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.ops.lottos.title);

export default async function AdminLottosPage() {
  const l = (await getI18n()).t.admin.ops.lottos;
  return (
    <>
      <PageHeader
        title={l.title}
        description={l.description}
        actions={
          <Suspense fallback={null}>
            <LottosActions />
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton className="h-[640px] rounded-card" />}>
        <LottosBody />
      </Suspense>
    </>
  );
}

async function LottosActions() {
  const [lottos, groups] = await Promise.all([getAdminLottos(), getAdminLottoGroups()]);
  return (
    <>
      <LottoGroups groups={groups} used={lottos.map((l) => l.group)} />
      <AddLotto groups={groups} lottos={lottos} />
    </>
  );
}

async function LottosBody() {
  const [lottos, groups, { rates, risk }] = await Promise.all([getAdminLottos(), getAdminLottoGroups(), getRiskSettings()]);
  return <LottoList lottos={lottos} groups={groups} rates={rates} risk={risk} />;
}

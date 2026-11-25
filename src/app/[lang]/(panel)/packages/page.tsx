import { Suspense } from "react";
import { PackageManager } from "@/components/admin/package-manager";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
import { getAdminPackages } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.ops.packages.title);

export default async function PackagesPage() {
  const p = (await getI18n()).t.admin.ops.packages;
  return (
    <>
      <PageHeader title={p.title} description={p.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  const { packages, lottos } = await getAdminPackages();
  return <PackageManager packages={packages} lottos={lottos} />;
}

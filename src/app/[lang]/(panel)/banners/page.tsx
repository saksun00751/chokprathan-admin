import { Suspense } from "react";
import { BannerEditor, BannerRow } from "@/components/admin/banner-editor";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
import { getAdminBanners } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.content.banners.title);

export default async function AdminBannersPage() {
  const bn = (await getI18n()).t.admin.content.banners;
  return (
    <>
      <PageHeader
        title={bn.title}
        description={bn.description}
        actions={<BannerEditor banner={null} />}
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <BannersBody />
      </Suspense>
    </>
  );
}

async function BannersBody() {
  const banners = await getAdminBanners();
  return (
    <ul className="flex flex-col gap-3">
      {banners.map((b, i) => (
        <BannerRow key={b.id} banner={b} first={i === 0} last={i === banners.length - 1} />
      ))}
    </ul>
  );
}

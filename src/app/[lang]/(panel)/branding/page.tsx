import { Suspense } from "react";
import { BrandingForm } from "@/components/admin/branding-form";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
import { getBrandingPage } from "@/server/data/branding";

export const generateMetadata = () => titled((t) => t.admin.content.branding.title);

export default async function BrandingPage() {
  const bd = (await getI18n()).t.admin.content.branding;
  return (
    <>
      <PageHeader title={bd.title} description={bd.description} />
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  return <BrandingForm {...await getBrandingPage()} />;
}

import { Suspense } from "react";
import { ThemePicker } from "@/components/admin/theme-picker";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
import { requireEmployee } from "@/server/session";
import { getThemeId } from "@/server/theme";

export const generateMetadata = () => titled((t) => t.admin.shell.items.theme);

export default async function ThemePage() {
  const th = (await getI18n()).t.admin.content.theme;
  return (
    <>
      <PageHeader title={th.title} description={th.description} />
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  await requireEmployee("theme.manage");
  return <ThemePicker current={await getThemeId()} />;
}

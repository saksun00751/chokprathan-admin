import { Suspense } from "react";
import { SettingsForm } from "@/components/admin/forms";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
import { getAllSettings } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.content.settings.title);

export default async function AdminSettingsPage() {
  const st = (await getI18n()).t.admin.content.settings;
  return (
    <>
      <PageHeader title={st.title} description={st.description} />
      <Suspense fallback={<Skeleton className="h-[640px] rounded-card" />}>
        <SettingsBody />
      </Suspense>
    </>
  );
}

async function SettingsBody() {
  const { site, wallet, rewards, points, production, smsReady } = await getAllSettings();
  return <SettingsForm site={site} wallet={wallet} rewards={rewards} points={points} production={production} smsReady={smsReady} />;
}

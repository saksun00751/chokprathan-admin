import { Suspense } from "react";
import { AvatarPicker } from "@/components/admin/avatar-picker";
import { Card, PageHeader, Skeleton } from "@/components/ui/primitives";
import { getI18n, titled } from "@/i18n/rsc";
import { getProfile } from "@/server/data/profile";

export const generateMetadata = () => titled((t) => t.admin.people.profile.title);

export default async function ProfilePage() {
  const pf = (await getI18n()).t.admin.people.profile;
  return (
    <>
      <PageHeader title={pf.title} description={pf.description} />
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  const [p, { t }] = await Promise.all([getProfile(), getI18n()]);
  const pf = t.admin.people.profile;
  const rows = [
    [pf.name, p.name || "-"],
    [pf.username, p.username],
    [pf.role, p.roleName ?? t.admin.shell.staff],
  ];
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card className="p-5">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-ink-3">{label}</dt>
              <dd className="truncate font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <AvatarPicker current={p.avatar} ready={p.ready} name={p.name || p.username} />
    </div>
  );
}

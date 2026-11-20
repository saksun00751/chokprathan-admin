import { ShieldAlert } from "lucide-react";
import { Suspense } from "react";
import { PasswordForm, TotpSetup } from "@/components/admin/security-forms";
import { Card, PageHeader, Skeleton } from "@/components/ui/primitives";
import { fmt } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getOwnSecurity } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.people.security.title);

export default function SecurityPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const [{ viewer, totpEnabled, totpRequired, mustSetUpTotp }, { t }] = await Promise.all([getOwnSecurity(), getI18n()]);
  const s = t.admin.people.security;
  return (
    <>
      <PageHeader
        title={s.title}
        description={
          viewer.mustChangePassword ? s.forced : fmt(s.account, { name: viewer.username || viewer.name, role: viewer.roleName ?? t.admin.shell.staff })
        }
      />
      {mustSetUpTotp && !viewer.mustChangePassword && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-card bg-warning-soft px-4 py-3 text-sm text-ink">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {s.requiredNote}
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-ink">{viewer.mustChangePassword ? s.setPassword : s.changePassword}</h2>
          <PasswordForm forced={viewer.mustChangePassword} />
        </Card>
        {!viewer.mustChangePassword && (
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold text-ink">{s.twoStep}</h2>
            <TotpSetup enabled={totpEnabled} required={totpRequired} />
          </Card>
        )}
      </div>
    </>
  );
}

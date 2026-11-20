import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Suspense } from "react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/rsc";
import { requireEmployeeAllowingPasswordChange } from "@/server/data/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.shell.denied.title };
}

export default function DeniedPage({ searchParams }: PageProps<"/[lang]/denied">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-card" />}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/[lang]/denied">["searchParams"] }) {
  const [viewer, { t }] = await Promise.all([requireEmployeeAllowingPasswordChange(), getI18n()]);
  const d = t.admin.shell.denied;
  const need = (await searchParams).need;
  const label = typeof need === "string" ? t.admin.shell.perms[need] : undefined;
  return (
    <Card>
      <EmptyState
        icon={<Lock className="size-6" aria-hidden="true" />}
        title={d.heading}
        description={
          <>
            {label ? <>{fmt(d.needs, { perm: label })} </> : null}
            {fmt(d.role, { role: viewer.roleName ?? t.admin.shell.staff })}
          </>
        }
        action={
          <Link href="/security" className="text-sm font-semibold text-brand hover:underline">
            {d.security}
          </Link>
        }
      />
    </Card>
  );
}

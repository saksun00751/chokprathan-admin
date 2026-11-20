import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SessionEndedNotice } from "@/components/shell/session-ended";
import { Skeleton } from "@/components/ui/primitives";
import { endedParam } from "@/domain/sessions";
import { getI18n } from "@/i18n/rsc";
import { safeNext } from "@/server/actions/safe-next";
import { getEmployee } from "@/server/session";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.console.title, robots: { index: false, follow: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">{t.console.title}</h1>
      <p className="mt-1 text-sm text-ink-2">{t.console.description}</p>
      <Suspense fallback={<FormSkeleton />}>
        <LoginBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LoginBody({ searchParams }: Pick<PageProps<"/[lang]/login">, "searchParams">) {
  const [{ next, ended }, employee, { t }] = await Promise.all([searchParams, getEmployee(), getI18n()]);
  const target = safeNext(Array.isArray(next) ? next[0] : next);
  // Already signed in: straight to the back office (its pages send unfinished set-up to /security).
  if (employee) redirect(target);
  const reason = endedParam(ended);
  return (
    <>
      {reason && <SessionEndedNotice reason={reason} s={t.common.session} />}
      <LoginForm next={target} />
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-11" />
      <Skeleton className="h-11" />
      <Skeleton className="h-11" />
    </div>
  );
}

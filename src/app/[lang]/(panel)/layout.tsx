import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import { io } from "next/cache";
import { Suspense } from "react";
import { SELF_DRAWN_SQL } from "@/domain/auto-result";
import { LogoMark } from "@/components/brand/logo";
import { ActiveAdminNav, AdminNav, type NavState } from "@/components/admin/nav";
import { ConfirmProvider } from "@/components/admin/confirm";
import { NAV_GROUPS } from "@/components/admin/nav-items";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { SessionWatch } from "@/components/shell/session-watch";
import { Skeleton } from "@/components/ui/primitives";
import { fmt } from "@/i18n/format";
import { Provide } from "@/i18n/provide";
import { getI18n } from "@/i18n/rsc";
import { q1 } from "@/server/db";
import { logoutAction } from "@/server/actions/auth";
import { requireEmployeeAllowingPasswordChange } from "@/server/data/admin";
import { can } from "@/server/services/employee-auth";
import { getEmployee, needsTotpSetup } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t.admin.shell.title, template: fmt(t.admin.shell.titleTemplate, { brand: t.common.brand }) },
    robots: { index: false, follow: false },
  };
}

/** Public address of the member site, shown as a "view site" link. Only http(s) values are used; unset hides the link. */
function memberSiteUrl(): string | null {
  const raw = process.env.MEMBER_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

async function navState(): Promise<NavState | null> {
  const viewer = await getEmployee();
  if (!viewer) return null;
  await io();
  // Until the password is changed (or 2-step sign-in set up, when required) only the security page opens.
  if (viewer.mustChangePassword || (await needsTotpSetup(viewer))) return { allowed: ["/security"], badges: { finance: 0, results: 0 } };
  const allowed = NAV_GROUPS.flatMap((g) => g.items)
    .filter((i) => i.need === null || can(viewer, i.need))
    .map((i) => i.href);
  const wantFinance = can(viewer, "finance.view");
  const wantResults = can(viewer, "rounds.result");
  const counts =
    wantFinance || wantResults
      ? await q1<{ f: number; r: number }>(
          `SELECT
             ${wantFinance ? "(SELECT COUNT(*) FROM deposits WHERE status = 'pending') + (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending')" : "0"} AS f,
             ${wantResults ? `(SELECT COUNT(*) FROM rounds r JOIN lottos l ON l.id = r.lotto_id WHERE r.status = 'scheduled' AND r.closes_at <= ? AND NOT ${SELF_DRAWN_SQL})` : "0"} AS r`,
          ...(wantResults ? [Date.now()] : []),
        )
      : undefined;
  return { allowed, badges: { finance: counts?.f ?? 0, results: counts?.r ?? 0 } };
}

async function LiveNav({ variant }: { variant: "side" | "top" }) {
  const state = await navState();
  if (!state) return <AdminNav pathname={null} state={null} variant={variant} />;
  return <ActiveAdminNav state={state} variant={variant} />;
}

/**
 * Every panel page sits behind a signed-in employee. Pages still authorize themselves (their data
 * readers call requireEmployee(permission)); this gate only lets an employee who must change their
 * password or set up 2-step sign-in reach /security, which requireEmployee would redirect to.
 */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireEmployeeAllowingPasswordChange();
  return children;
}

async function AdminName() {
  const [viewer, { t }] = await Promise.all([getEmployee(), getI18n()]);
  if (!viewer) return null;
  return (
    <span className="flex min-w-0 flex-col text-right leading-tight">
      <span className="max-w-40 truncate text-sm font-medium text-ink">{viewer.name || viewer.username}</span>
      <span className="max-w-40 truncate text-xs text-ink-3">{viewer.roleName ?? t.admin.shell.staff}</span>
    </span>
  );
}

export default async function AdminLayout({ children }: LayoutProps<"/[lang]">) {
  const { t } = await getI18n();
  const sh = t.admin.shell;
  const siteUrl = memberSiteUrl();
  return (
    <Provide ns={["admin"]}>
      <ConfirmProvider>
        <SessionWatch />
        <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
          <aside className="sticky top-0 hidden h-dvh flex-col bg-ink text-white lg:flex">
            <Link href="/" className="flex h-16 shrink-0 items-center gap-2.5 px-5">
              <LogoMark className="size-7" />
              <span className="font-semibold whitespace-nowrap">{sh.title}</span>
            </Link>
            <Suspense fallback={<AdminNav pathname={null} state={null} variant="side" />}>
              <LiveNav variant="side" />
            </Suspense>
            <p className="px-5 py-4 text-xs text-on-deep-2">{t.common.brand}</p>
          </aside>
          <div className="flex min-w-0 flex-col">
            <header className="sticky top-0 z-30 border-b border-line bg-surface">
              <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
                <Link href="/" className="flex items-center gap-2 lg:hidden">
                  <LogoMark className="size-7" />
                  <span className="font-semibold">{sh.title}</span>
                </Link>
                <div className="flex-1" />
                {siteUrl && (
                  <a
                    href={siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-sm font-medium text-ink-2 hover:bg-panel hover:text-ink"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{sh.viewSite}</span>
                  </a>
                )}
                <LanguageSwitcher />
                <div className="hidden sm:block">
                  <Suspense fallback={null}>
                    <AdminName />
                  </Suspense>
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-sm font-medium text-danger hover:bg-danger-soft"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{sh.logout}</span>
                  </button>
                </form>
              </div>
              <div className="lg:hidden">
                <Suspense fallback={<AdminNav pathname={null} state={null} variant="top" />}>
                  <LiveNav variant="top" />
                </Suspense>
              </div>
            </header>
            <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
              <Suspense fallback={<Skeleton className="h-[480px] rounded-card" />}>
                <AdminGate>{children}</AdminGate>
              </Suspense>
            </main>
          </div>
        </div>
      </ConfirmProvider>
    </Provide>
  );
}

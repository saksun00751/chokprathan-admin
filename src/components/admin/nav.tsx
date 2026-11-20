"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, type Item } from "./nav-items";
import { useI18n } from "@/i18n/client";
import { stripLocale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/cn";

const active = (raw: string | null, href: string) => {
  if (!raw) return false;
  const pathname = stripLocale(raw);
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
};

export interface NavState {
  /** hrefs this staff member may open */
  allowed: string[];
  badges: { finance: number; results: number };
}

export function AdminNav({ pathname, state, variant }: { pathname: string | null; state: NavState | null; variant: "side" | "top" }) {
  const sh = useI18n().t.admin.shell;
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => state?.allowed.includes(i.href)) })).filter((g) => g.items.length > 0);
  const badgeOf = (item: Item) => (item.badge && state ? state.badges[item.badge] : 0);

  if (variant === "side") {
    return (
      <nav aria-label={sh.menuLabel} className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.key} className="mt-4 first:mt-1">
            <p className="px-3 pb-1 text-xs font-medium text-on-deep-2/80">{sh.groups[g.key]}</p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const on = active(pathname, item.href);
                const Icon = item.icon;
                const badge = badgeOf(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors",
                        on ? "bg-white/12 text-white" : "text-on-deep-2 hover:bg-white/6 hover:text-white",
                      )}
                    >
                      <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      <span className="flex-1 truncate">{sh.items[item.key]}</span>
                      {badge ? (
                        <span className="tnum rounded-full bg-gold px-1.5 text-xs font-semibold text-ink" aria-label={fmt(sh.pendingBadge, { n: badge })}>
                          {badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label={sh.menuLabel} className="no-scrollbar overflow-x-auto border-t border-line bg-surface px-3">
      <ul className="flex w-max gap-1 py-2">
        {groups.flatMap((g) => g.items).map((item) => {
          const on = active(pathname, item.href);
          const badge = badgeOf(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap", on ? "bg-ink text-white" : "text-ink-2 hover:bg-panel")}
              >
                {sh.items[item.key]}
                {badge ? <span className="tnum rounded-full bg-gold px-1.5 text-xs font-semibold text-ink">{badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ActiveAdminNav({ state, variant }: { state: NavState; variant: "side" | "top" }) {
  return <AdminNav pathname={usePathname()} state={state} variant={variant} />;
}

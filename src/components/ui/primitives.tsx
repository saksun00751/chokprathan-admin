import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { formatBaht } from "@/domain/money";
import { cn } from "@/lib/cn";

/* ---------- Badge ---------- */

const BADGE = {
  neutral: "bg-panel text-ink-2",
  brand: "bg-brand-soft text-brand-soft-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  gold: "bg-gold text-ink",
  outline: "border border-line-strong text-ink-2",
} as const;

export type BadgeTone = keyof typeof BADGE;

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold", BADGE[tone], className)}>
      {children}
    </span>
  );
}

/* ---------- Card ---------- */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("rounded-card border border-line bg-surface shadow-card", className)} />;
}

/* ---------- Money ---------- */

export function Money({
  satang,
  className,
  sign = false,
  decimals = "always",
  unit = "symbol",
}: {
  satang: number;
  className?: string;
  sign?: boolean;
  decimals?: "always" | "auto" | "never";
  unit?: "symbol" | "none";
}) {
  const text = formatBaht(satang, { sign, decimals });
  return (
    <span className={cn("tnum whitespace-nowrap", className)}>
      {unit === "symbol" ? (text.startsWith("-") || text.startsWith("+") ? `${text[0]}฿${text.slice(1)}` : `฿${text}`) : text}
    </span>
  );
}

/* ---------- Skeleton / Empty ---------- */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton h-4", className)} />;
}

export function EmptyState({
  icon,
  art,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  /** A larger illustration shown instead of the small icon circle. */
  art?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {art ? <div className="mb-2">{art}</div> : icon && <div className="mb-3 grid size-12 place-items-center rounded-full bg-brand-soft text-brand">{icon}</div>}
      <p className="text-base font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- Page header ---------- */

export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="-ml-1 mb-1 inline-flex h-8 items-center gap-0.5 rounded-control pr-2 text-sm font-medium text-ink-2 hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="text-lg font-semibold text-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

/* ---------- Ticket divider: a bill is a ticket ---------- */

export function TicketDivider({ className, tone = "canvas" }: { className?: string; tone?: "canvas" | "deep" }) {
  const notch = tone === "deep" ? "bg-brand-deep" : "bg-canvas";
  return (
    <div className={cn("relative my-0 h-4", className)} aria-hidden="true">
      <span className={cn("absolute top-1/2 -left-2 size-4 -translate-y-1/2 rounded-full border-r border-line", notch)} />
      <span className="ticket-edge absolute inset-x-4 top-1/2 h-px -translate-y-1/2" />
      <span className={cn("absolute top-1/2 -right-2 size-4 -translate-y-1/2 rounded-full border-l border-line", notch)} />
    </div>
  );
}

/* ---------- Link tabs (URL-driven filters) ---------- */

export function TabLinks({ items, className, label }: { items: { href: string; label: ReactNode; active: boolean; count?: number }[]; className?: string; label: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <ul className="flex w-max gap-1 rounded-control bg-panel p-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-sm font-medium whitespace-nowrap transition-colors",
                item.active ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
              )}
            >
              {item.label}
              {item.count !== undefined && <span className="tnum text-xs text-ink-3">{item.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ---------- Definition rows ---------- */

export function InfoRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", className)}>
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

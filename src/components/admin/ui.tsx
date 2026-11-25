import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Table({ children, minWidth = 640, className }: { children: ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-card border border-line bg-surface shadow-card", className)}>
      <table className="w-full text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, align = "left", className }: { children?: ReactNode; align?: "left" | "right" | "center"; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "sticky top-0 bg-panel px-3 py-2.5 text-xs font-medium whitespace-nowrap text-ink-3",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className }: { children?: ReactNode; align?: "left" | "right" | "center"; className?: string }) {
  return (
    <td className={cn("px-3 py-2.5 align-middle", align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", className)}>{children}</td>
  );
}

/** A compact figure for operator dashboards: label above, value below. */
export function Figure({ label, children, hint, tone }: { label: string; children: ReactNode; hint?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={cn("tnum mt-1 text-xl font-semibold", tone === "good" && "text-success", tone === "bad" && "text-danger")}>{children}</dd>
      {hint && <dd className="mt-0.5 text-xs text-ink-3">{hint}</dd>}
    </div>
  );
}

/** Badge tone per round phase; the words come from the admin dictionary (shell.phase). */
export const PHASE_TONE = { upcoming: "neutral", open: "success", closed: "warning", confirming: "warning", resulted: "brand", cancelled: "outline" } as const;

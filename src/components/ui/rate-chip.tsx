"use client";

import { formatRate } from "@/core/rules/money";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";

/**
 * Pay rate with honest state: base, cut (old rate struck through + the "limited" word), or closed.
 * rate100 null = closed; undefined = base rate.
 */
export function RateChip({
  baseRate100,
  rate100,
  className,
  compact = false,
}: {
  baseRate100: number;
  rate100?: number | null;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (rate100 === null) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger", className)}>
        {t.lotto.rate.closed}
      </span>
    );
  }
  if (rate100 !== undefined && rate100 < baseRate100) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning", className)}>
        {!compact && <s className="tnum font-normal text-ink-3">×{formatRate(baseRate100)}</s>}
        <span className="tnum">×{formatRate(rate100)}</span>
        <span>{t.lotto.rate.cut}</span>
      </span>
    );
  }
  return <span className={cn("tnum text-sm font-semibold text-ink-2", className)}>×{formatRate(baseRate100)}</span>;
}

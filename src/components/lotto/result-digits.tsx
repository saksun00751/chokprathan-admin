"use client";

import type { ResultFormat, RoundResult } from "chokprathan-core/rules/types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";

function Digits({ value, size = "md", tone = "ink" }: { value: string; size?: "sm" | "md" | "lg"; tone?: "ink" | "brand" }) {
  return (
    <span
      className={cn(
        "tnum font-semibold tracking-[0.12em]",
        size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-base",
        tone === "brand" ? "text-brand" : "text-ink",
      )}
    >
      {value}
    </span>
  );
}

function Part({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)}>
      <span className="text-xs text-ink-3">{label}</span>
      {children}
    </div>
  );
}

/** Full result block for a round. */
export function ResultDigits({ format, result, size = "md" }: { format: ResultFormat; result: RoundResult; size?: "md" | "lg" }) {
  const r = useI18n().t.lotto.result;
  if (format === "thai_gov") {
    return (
      <div className="flex flex-col gap-3">
        <Part label={r.first6}>
          <Digits value={result.first6 ?? ""} size={size === "lg" ? "lg" : "md"} tone="brand" />
        </Part>
        <div className="grid grid-cols-3 gap-3">
          <Part label={r.front3}>
            <span className="flex flex-col">
              {result.front3?.map((n, i) => <Digits key={i} value={n} size="sm" />)}
            </span>
          </Part>
          <Part label={r.back3}>
            <span className="flex flex-col">
              {result.back3?.map((n, i) => <Digits key={i} value={n} size="sm" />)}
            </span>
          </Part>
          <Part label={r.bottom2}>
            <Digits value={result.bottom2} size="md" />
          </Part>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-6">
      {format === "laos4" && (
        <Part label={r.top4}>
          <Digits value={result.top4 ?? ""} size={size === "lg" ? "lg" : "md"} tone="brand" />
        </Part>
      )}
      <Part label={r.top3}>
        <Digits value={result.top3} size={format === "laos4" || size !== "lg" ? "md" : "lg"} tone={format === "laos4" ? "ink" : "brand"} />
      </Part>
      <Part label={r.bottom2}>
        <Digits value={result.bottom2} size="md" />
      </Part>
    </div>
  );
}

/** One-line result for dense lists. */
export function ResultInline({ format, result }: { format: ResultFormat; result: RoundResult }) {
  return (
    <span className="tnum inline-flex items-baseline gap-3 font-semibold tracking-[0.08em]">
      {format === "thai_gov" && <span className="text-brand">{result.first6}</span>}
      {format === "laos4" && <span className="text-brand">{result.top4}</span>}
      {format !== "thai_gov" && format !== "laos4" && <span className="text-brand">{result.top3}</span>}
      <span className="text-ink">{result.bottom2}</span>
    </span>
  );
}

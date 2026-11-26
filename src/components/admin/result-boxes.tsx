"use client";

import type { ResultFormat } from "@/core/rules/types";
import type { ResultValues } from "@/components/admin/result-summary";
import { useI18n } from "@/i18n/client";

const digitInput =
  "tnum h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-center text-lg font-semibold tracking-[0.2em] focus-visible:border-brand";

const BOXES: Record<ResultFormat, [keyof ResultValues, number][]> = {
  standard: [["top3", 3], ["bottom2", 2]],
  laos4: [["top4", 4]],
  thai_gov: [["first6", 6], ["f1", 3], ["f2", 3], ["b1", 3], ["b2", 3], ["bottom2", 2]],
};

/** The input boxes of one result format, for typing a result a second time or a corrected one. */
export function ResultBoxes({
  format,
  values,
  onChange,
  round,
}: {
  format: ResultFormat;
  values: ResultValues;
  onChange: (next: ResultValues) => void;
  /** lottery and round, read out before each box */
  round: string;
}) {
  const rf = useI18n().t.admin.ops.resultForm;
  const labels: Record<keyof ResultValues, string> = {
    top3: rf.top3,
    bottom2: rf.bottom2,
    top4: rf.top4,
    first6: rf.first6,
    f1: rf.front1,
    f2: rf.front2,
    b1: rf.back1,
    b2: rf.back2,
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      {BOXES[format].map(([key, max]) => (
        <label key={key} className={max > 3 ? "col-span-2 flex flex-col gap-1 text-sm" : "flex flex-col gap-1 text-sm"}>
          <span className="text-xs text-ink-3">{labels[key]}</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={values[key]}
            maxLength={max}
            aria-label={`${round} ${labels[key]}`}
            onChange={(e) => onChange({ ...values, [key]: e.target.value.replace(/\D/g, "").slice(0, max) })}
            className={digitInput}
          />
        </label>
      ))}
    </div>
  );
}

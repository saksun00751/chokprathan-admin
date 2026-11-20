import type { ReactNode } from "react";
import type { ResultInput } from "@/domain/match";
import type { ResultFormat } from "@/domain/types";

/** What a result form holds while staff type: one string per box. */
export type ResultValues = { top3: string; bottom2: string; top4: string; first6: string; f1: string; f2: string; b1: string; b2: string };
export const EMPTY_RESULT: ResultValues = { top3: "", bottom2: "", top4: "", first6: "", f1: "", f2: "", b1: "", b2: "" };

type Labels = { first6: string; front1: string; front2: string; back1: string; back2: string; bottom2: string; top3: string; top4: string };

export function resultComplete(format: ResultFormat, v: ResultValues) {
  if (format === "laos4") return /^\d{4}$/.test(v.top4);
  if (format === "thai_gov") return /^\d{6}$/.test(v.first6) && [v.f1, v.f2, v.b1, v.b2].every((x) => /^\d{3}$/.test(x)) && /^\d{2}$/.test(v.bottom2);
  return /^\d{3}$/.test(v.top3) && /^\d{2}$/.test(v.bottom2);
}

export function resultInput(format: ResultFormat, v: ResultValues): ResultInput {
  if (format === "thai_gov") return { first6: v.first6, front3: [v.f1, v.f2], back3: [v.b1, v.b2], bottom2: v.bottom2 };
  if (format === "laos4") return { top4: v.top4 };
  return { top3: v.top3, bottom2: v.bottom2 };
}

/** label → digits, in the order the form shows them, for the confirmation before a result is saved. */
export function resultPairs(format: ResultFormat, v: ResultValues, l: Labels): [string, string][] {
  if (format === "thai_gov")
    return [
      [l.first6, v.first6],
      [l.front1, v.f1],
      [l.front2, v.f2],
      [l.back1, v.b1],
      [l.back2, v.b2],
      [l.bottom2, v.bottom2],
    ];
  if (format === "laos4") return [[l.top4, v.top4]];
  return [
    [l.top3, v.top3],
    [l.bottom2, v.bottom2],
  ];
}

/** Big, evenly spaced digits so a wrong number stands out in a confirmation. */
export function Digits({ children }: { children: ReactNode }) {
  return <span className="tnum text-lg font-semibold tracking-[0.2em] text-ink">{children || "-"}</span>;
}

import { MINUTE } from "@/domain/time";
import { dayOf, dayStartOf, emptyDay } from "./derive";
import type { BuiltSpan, DayStats } from "./types";

/** Today's document is rebuilt every minute by the scheduler; older than this it is rebuilt on read. */
export const TODAY_MAX_AGE = 3 * MINUTE;

export interface LoadDeps {
  now: number;
  /** stored documents for these days (any subset) */
  load(ids: number[]): Promise<DayStats[]>;
  /** build days `from`..`to` (inclusive) from MariaDB */
  build(from: number, to: number): Promise<BuiltSpan>;
  save(span: BuiltSpan): Promise<void>;
}

/** A stored day is current if it was built after the day ended, or (today) within the last few minutes. */
export function isCurrent(doc: DayStats, now: number): boolean {
  const today = dayOf(now);
  return doc._id === today ? doc.builtAt >= now - TODAY_MAX_AGE : doc.builtAt >= dayStartOf(doc._id + 1);
}

/** Runs of consecutive day numbers, so neighbouring days are built with one set of queries. */
export function spans(ids: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const d of [...new Set(ids)].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && d === last[1] + 1) last[1] = d;
    else out.push([d, d]);
  }
  return out;
}

/**
 * The summary documents for these days: stored ones when current, the rest built from MariaDB and
 * saved. Errors from loading or saving reach the caller, which then builds everything in memory.
 */
export async function loadDays(deps: LoadDeps, ids: number[]): Promise<DayStats[]> {
  const today = dayOf(deps.now);
  const past = ids.filter((d) => d <= today);
  const stored = new Map((past.length ? await deps.load(past) : []).map((x) => [x._id, x]));
  const result = new Map<number, DayStats>();
  for (const d of past) {
    const doc = stored.get(d);
    if (doc && isCurrent(doc, deps.now)) result.set(d, doc);
  }
  for (const [from, to] of spans(past.filter((d) => !result.has(d)))) {
    const built = await deps.build(from, to);
    await deps.save(built);
    for (const day of built.days) result.set(day._id, day);
  }
  return [...new Set(ids)].sort((a, b) => a - b).map((d) => result.get(d) ?? emptyDay(d, deps.now));
}

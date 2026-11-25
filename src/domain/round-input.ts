import { bkkMs, bkkParts, DAY } from "./time";

/** A `<input type="datetime-local">` value, read as Asia/Bangkok. Null unless it is a real date and time. */
export function parseBkkLocal(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d, hh, mm] = m.slice(1).map(Number);
  const ms = bkkMs(y, mo, d, hh, mm);
  const p = bkkParts(ms);
  // Date.UTC rolls 30 February over into March; reading it back catches that.
  return p.y === y && p.m === mo && p.d === d && p.hh === hh && p.mm === mm ? ms : null;
}

export interface RoundTimes {
  opensAt: number;
  closesAt: number;
  drawAt: number;
}

export type RoundTimesProblem = "closePast" | "openAfterClose" | "drawBeforeClose" | "tooFar";

/** Why a round made by hand cannot have these times, or null when it can. */
export function roundTimesProblem({ opensAt, closesAt, drawAt }: RoundTimes, now: number): RoundTimesProblem | null {
  if (closesAt <= now) return "closePast";
  if (opensAt >= closesAt) return "openAfterClose";
  if (drawAt < closesAt) return "drawBeforeClose";
  // A typo in the year would otherwise open a round nobody can find.
  return drawAt > now + 366 * DAY ? "tooFar" : null;
}

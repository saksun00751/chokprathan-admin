import { addDays, bkkMs, dayKey, parseDayKey } from "./time";
import type { Schedule } from "./types";

function parseHM(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return { h, m };
}

/** Close times (epoch ms, ascending) of rounds that belong to the Bangkok day `key`. */
export function closesForDay(schedule: Schedule, key: string): number[] {
  const { y, m, d } = parseDayKey(key);
  switch (schedule.kind) {
    case "weekly": {
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (!schedule.days.includes(dow)) return [];
      const t = parseHM(schedule.close);
      return [bkkMs(y, m, d, t.h, t.m)];
    }
    case "monthly": {
      if (!schedule.days.includes(d)) return [];
      const t = parseHM(schedule.close);
      return [bkkMs(y, m, d, t.h, t.m)];
    }
    case "interval": {
      const t = parseHM(schedule.firstClose);
      const first = bkkMs(y, m, d, t.h, t.m);
      return Array.from({ length: schedule.count }, (_, i) => first + i * schedule.everyMin * 60_000);
    }
  }
}

/** The earliest scheduled close strictly after `afterMs` (searching 40 days ahead), or null. */
export function nextClose(schedule: Schedule, afterMs: number): number | null {
  const today = dayKey(afterMs);
  for (let i = -1; i <= 40; i++) {
    const hit = closesForDay(schedule, addDays(today, i)).find((close) => close > afterMs);
    if (hit !== undefined) return hit;
  }
  return null;
}

/** The latest scheduled close strictly before `beforeMs` (searching 40 days back), or null. */
export function previousClose(schedule: Schedule, beforeMs: number): number | null {
  const today = dayKey(beforeMs);
  let best: number | null = null;
  for (let i = 0; i >= -40; i--) {
    for (const close of closesForDay(schedule, addDays(today, i))) {
      if (close < beforeMs && (best === null || close > best)) best = close;
    }
  }
  return best;
}

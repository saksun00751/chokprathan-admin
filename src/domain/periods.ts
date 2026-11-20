import { BKK_OFFSET_MS, DAY, HOUR, addDays, bkkParts, dayKey, dayStartMs, parseDayKey } from "./time";

/** Date ranges for the dashboard and reports, always in Bangkok calendar days. */
export const PERIODS = [{ id: "today" }, { id: "yesterday" }, { id: "7d" }, { id: "30d" }, { id: "month" }, { id: "lastmonth" }] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];

export interface DateRange {
  /** inclusive day keys */
  from: string;
  to: string;
  startMs: number;
  /** exclusive */
  endMs: number;
  days: number;
  bucket: "hour" | "day";
  period: PeriodId | "custom";
}

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_DAYS = 366;

function validKey(key: string | undefined): key is string {
  const m = key ? KEY.exec(key) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function make(from: string, to: string, period: DateRange["period"]): DateRange {
  const startMs = dayStartMs(from);
  const endMs = dayStartMs(addDays(to, 1));
  const days = Math.round((endMs - startMs) / DAY);
  return { from, to, startMs, endMs, days, bucket: days <= 1 ? "hour" : "day", period };
}

export function resolveRange(input: { period?: string; from?: string; to?: string }, now: number): DateRange | null {
  if (input.from !== undefined || input.to !== undefined) {
    if (!validKey(input.from) || !validKey(input.to) || input.from > input.to) return null;
    const r = make(input.from, input.to, "custom");
    return r.days > MAX_DAYS ? null : r;
  }
  const today = dayKey(now);
  const p = bkkParts(now);
  switch (input.period) {
    case "yesterday":
      return make(addDays(today, -1), addDays(today, -1), "yesterday");
    case "7d":
      return make(addDays(today, -6), today, "7d");
    case "30d":
      return make(addDays(today, -29), today, "30d");
    case "month":
      return make(`${p.y}-${String(p.m).padStart(2, "0")}-01`, today, "month");
    case "lastmonth": {
      const first = `${p.y}-${String(p.m).padStart(2, "0")}-01`;
      const lastDay = addDays(first, -1);
      const { y, m } = parseDayKey(lastDay);
      return make(`${y}-${String(m).padStart(2, "0")}-01`, lastDay, "lastmonth");
    }
    default:
      return make(today, today, "today");
  }
}

/** The range of the same length right before this one (for period-over-period change). */
export function previousRange(r: DateRange): DateRange {
  return make(addDays(r.from, -r.days), addDays(r.from, -1), r.period);
}

/** SQL bucket expression for an epoch-ms column: Bangkok hour or day number. */
export function bucketSql(r: DateRange, column: string): string {
  if (!/^[a-z_.]+$/.test(column)) throw new Error("bad column");
  return `((${column} + ${BKK_OFFSET_MS}) DIV ${r.bucket === "hour" ? HOUR : DAY})`;
}

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** Every bucket in the range, with the key bucketSql produces and a short label (Thai unless `dayLabel` is given). */
export function bucketsOf(r: DateRange, dayLabel?: (startMs: number) => string): { key: number; startMs: number; label: string }[] {
  const size = r.bucket === "hour" ? HOUR : DAY;
  const out: { key: number; startMs: number; label: string }[] = [];
  for (let t = r.startMs; t < r.endMs; t += size) {
    const p = bkkParts(t);
    out.push({
      key: Math.floor((t + BKK_OFFSET_MS) / size),
      startMs: t,
      label: r.bucket === "hour" ? `${String(p.hh).padStart(2, "0")}:00` : dayLabel ? dayLabel(t) : `${p.d} ${MONTHS_SHORT[p.m - 1]}`,
    });
  }
  return out;
}

/** The preset's name, or the custom dates. `labels` comes from the admin dictionary (shell.period). */
export function rangeLabel(r: DateRange, labels: { presets: Record<string, string>; range: string }): string {
  const preset = PERIODS.find((p) => p.id === r.period);
  if (preset) return labels.presets[preset.id] ?? preset.id;
  return r.from === r.to ? r.from : labels.range.replace("{from}", r.from).replace("{to}", r.to);
}

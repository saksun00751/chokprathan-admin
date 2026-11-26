/** Asia/Bangkok time helpers. Bangkok is UTC+7 with no daylight saving. */

export const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, "0");

export function bkkMs(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number {
  return Date.UTC(y, m - 1, d, hh, mm, ss) - BKK_OFFSET_MS;
}

export function bkkParts(ms: number) {
  const t = new Date(ms + BKK_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hh: t.getUTCHours(),
    mm: t.getUTCMinutes(),
    ss: t.getUTCSeconds(),
    dow: t.getUTCDay(),
  };
}

/** "YYYY-MM-DD" of the Bangkok calendar day containing ms. */
export function dayKey(ms: number): string {
  const p = bkkParts(ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function parseDayKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

export function addDays(key: string, n: number): string {
  const { y, m, d } = parseDayKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function dayStartMs(key: string): number {
  const { y, m, d } = parseDayKey(key);
  return bkkMs(y, m, d);
}

export function formatClock(ms: number): string {
  const p = bkkParts(ms);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTHS_LONG = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];
export const WEEKDAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** Thai date with the Buddhist-era year: "16 พ.ย. 69" or "16 พฤศจิกายน 2569". */
export function formatThaiDate(ms: number, style: "short" | "long" = "short"): string {
  const p = bkkParts(ms);
  const be = p.y + 543;
  return style === "short"
    ? `${p.d} ${MONTHS_SHORT[p.m - 1]} ${String(be).slice(-2)}`
    : `${p.d} ${MONTHS_LONG[p.m - 1]} ${be}`;
}

export function formatDateTime(ms: number): string {
  return `${formatThaiDate(ms)} ${formatClock(ms)}`;
}

export function splitCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

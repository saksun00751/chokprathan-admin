import type { Locale } from "./config";

/** Fill `{name}` placeholders. Unknown placeholders are left as they are. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** One digit style everywhere (1,234.5): lottery numbers and money must read the same in every language. */
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
export const formatNumber = (n: number) => numberFormat.format(n);

/**
 * Month names per language (CLDR). Dates are built from this table instead of Intl.DateTimeFormat
 * because browsers ship partial locale data (desktop Chrome formats Lao, Burmese, and Khmer dates in
 * English), and a date rendered on the server must come out identical in the browser.
 */
const MONTHS: Record<Locale, { short: readonly string[]; long: readonly string[] }> = {
  th: {
    short: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
    long: ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],
  },
  en: {
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"],
    long: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
  lo: {
    short: ["ມ.ກ.", "ກ.ພ.", "ມ.ນ.", "ມ.ສ.", "ພ.ພ.", "ມິ.ຖ.", "ກ.ລ.", "ສ.ຫ.", "ກ.ຍ.", "ຕ.ລ.", "ພ.ຈ.", "ທ.ວ."],
    long: ["ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ", "ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ"],
  },
  my: {
    short: ["ဇန်", "ဖေ", "မတ်", "ဧ", "မေ", "ဇွန်", "ဇူ", "ဩ", "စက်", "အောက်", "နို", "ဒီ"],
    long: ["ဇန်နဝါရီ", "ဖေဖော်ဝါရီ", "မတ်", "ဧပြီ", "မေ", "ဇွန်", "ဇူလိုင်", "ဩဂုတ်", "စက်တင်ဘာ", "အောက်တိုဘာ", "နိုဝင်ဘာ", "ဒီဇင်ဘာ"],
  },
  km: {
    short: ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"],
    long: ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"],
  },
};

/** Thailand is UTC+7 all year (no daylight saving). */
const BANGKOK = 7 * 3_600_000;

/** The calendar date in Bangkok. Thai counts years in the Buddhist era. */
function bangkokDate(ms: number, lang: Locale) {
  const d = new Date(ms + BANGKOK);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() + (lang === "th" ? 543 : 0) };
}

/** "16 พ.ย. 69", "16 Nov 26", ...; long: "16 พฤศจิกายน 2569", "16 November 2026". */
export function formatDate(ms: number, lang: Locale, style: "short" | "long" = "short"): string {
  const { day, month, year } = bangkokDate(ms, lang);
  return style === "short" ? `${day} ${MONTHS[lang].short[month]} ${String(year % 100).padStart(2, "0")}` : `${day} ${MONTHS[lang].long[month]} ${year}`;
}

export function formatDayMonth(ms: number, lang: Locale): string {
  const { day, month } = bangkokDate(ms, lang);
  return `${day} ${MONTHS[lang].short[month]}`;
}

export function formatClock(ms: number): string {
  const t = new Date(ms + BANGKOK);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

export function formatDateTime(ms: number, lang: Locale): string {
  return `${formatDate(ms, lang)} ${formatClock(ms)}`;
}

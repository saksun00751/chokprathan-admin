import type { Schedule } from "chokprathan-core/rules/types";

/** Country flags both apps can draw (components/ui/flag). A lottery with none shows the Thai flag. */
export const FLAG_CODES = ["TH", "LA", "VN", "MY", "SG", "JP", "CN", "HK", "TW", "KR", "IN", "EG", "RU", "DE", "GB", "US"] as const;

/**
 * A lottery's code in links. It is also looked up in the dictionaries (`t.lotto.names[slug]`), so
 * names every object already has, such as "constructor", are refused.
 */
export const isLottoSlug = (v: string) => v.length <= 40 && /^[a-z](?:[a-z0-9]|-(?=[a-z0-9]))+$/.test(v) && !(v in {});

const SLUG_MAX = 40;

/** A free link code made from an English short name, or "" when the name cannot give a whole one. */
export function suggestSlug(shortName: string, taken: readonly string[]): string {
  // A code made from only the Latin part of a mixed name ("ฮานอย VIP" → "vip") would mislead.
  if (/[^\x20-\x7e]/.test(shortName.trim())) return "";
  const base = shortName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-");
  for (let n = 1; ; n++) {
    const tail = n === 1 ? "" : `-${n}`;
    const slug = base.slice(0, SLUG_MAX - tail.length).replace(/-$/, "") + tail;
    if (!isLottoSlug(slug)) return "";
    if (!taken.includes(slug)) return slug;
  }
}

/* The checks below mirror the server's schema, so a wrong value is named next to its field. */

export type DetailField = "name" | "shortName" | "slug" | "group";
export type DetailProblem = "name" | "shortName" | "slugFormat" | "slugTaken" | "group";

export function detailProblems(v: Record<DetailField, string>, taken: readonly string[]): Partial<Record<DetailField, DetailProblem>> {
  const out: Partial<Record<DetailField, DetailProblem>> = {};
  const outside = (text: string, min: number, max: number) => text.trim().length < min || text.trim().length > max;
  if (outside(v.name, 2, 60)) out.name = "name";
  if (outside(v.shortName, 1, 30)) out.shortName = "shortName";
  if (!isLottoSlug(v.slug)) out.slug = "slugFormat";
  else if (taken.includes(v.slug)) out.slug = "slugTaken";
  if (!v.group) out.group = "group";
  return out;
}

export type ScheduleProblem = "days" | "time" | "opens" | "everyMin" | "count" | "delay";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The first thing wrong with a draw schedule and result delay, or null. */
export function scheduleProblem(s: Schedule, resultDelayMin: number): ScheduleProblem | null {
  const close = s.kind === "interval" ? s.firstClose : s.close;
  if (s.kind !== "interval" && s.days.length === 0) return "days";
  if (!HHMM.test(close) || (s.opens !== undefined && !HHMM.test(s.opens))) return "time";
  // "HH:MM" compares as text.
  if (s.opens !== undefined && s.opens >= close) return "opens";
  if (s.kind === "interval" && (s.everyMin < 5 || s.everyMin > 720)) return "everyMin";
  if (s.kind === "interval" && (s.count < 1 || s.count > 288)) return "count";
  if (resultDelayMin > 1440) return "delay";
  return null;
}

type Settings = { group: string; format: string; flag: string | null; resultDelayMin: number; schedule: Schedule };

/** What a new lottery takes over from an existing one. Names, link code and rates stay its own. */
export function copyFromLotto<T extends Settings>({ group, format, flag, resultDelayMin, schedule }: T): Pick<T, keyof Settings> {
  return { group, format, flag, resultDelayMin, schedule: structuredClone(schedule) } as Pick<T, keyof Settings>;
}

export function matchesLotto(l: { name: string; shortName: string; slug: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  return [l.name, l.shortName, l.slug].some((text) => text.toLowerCase().includes(q));
}

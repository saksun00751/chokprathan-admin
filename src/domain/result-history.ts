/** The filter of the result history: read from the address, narrowed to lotteries, written back into links. */
import { addDays, dayKey, dayStartMs } from "@/core/rules/time";
import { matchesLotto } from "./new-lotto";

export const HISTORY_PER_PAGE = 50;

export interface HistoryFilter {
  /** Draw days, both included. */
  from: string;
  to: string;
  /** A lotto group code, or "" for every group. */
  group: string;
  search: string;
  page: number;
}

/** A date that does not read back as itself does not exist. */
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && dayKey(dayStartMs(v)) === v;

export function parseHistoryFilter(params: Record<string, string | string[] | undefined>, today: string): HistoryFilter {
  const text = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v.trim() : "";
  };
  const to = isDay(text("to")) ? text("to") : today;
  const from = isDay(text("from")) ? text("from") : addDays(to, -6);
  const page = text("page");
  return {
    // "YYYY-MM-DD" compares as text.
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    group: text("group").slice(0, 40),
    search: text("q").slice(0, 40),
    page: /^[1-9]\d{0,8}$/.test(page) ? Number(page) : 1,
  };
}

/** The ids the group and search leave, or null when neither narrows anything. */
export function lottoIdsFor(lottos: readonly { id: number; group: string; name: string; shortName: string; slug: string }[], f: Pick<HistoryFilter, "group" | "search">): number[] | null {
  if (!f.group && !f.search) return null;
  return lottos.filter((l) => (!f.group || l.group === f.group) && matchesLotto(l, f.search)).map((l) => l.id);
}

export function historyQuery(f: HistoryFilter): string {
  const p = new URLSearchParams({ from: f.from, to: f.to });
  if (f.group) p.set("group", f.group);
  if (f.search) p.set("q", f.search);
  if (f.page > 1) p.set("page", String(f.page));
  return `?${p}`;
}

/** The filter of the bill list: read from the address, turned into SQL, and written back into links. */
import { DAY, dayKey, dayStartMs } from "@/core/rules/time";
import type { BillStatus } from "./labels";

export const BILL_STATUSES: readonly BillStatus[] = ["pending", "won", "lost", "cancelled", "refunded"];
export const BILLS_PER_PAGE = 50;

export interface BillFilter {
  /** The Bangkok day the bill was placed, or "" for any day. */
  day: string;
  lottoId: number | null;
  status: BillStatus | "all";
  search: string;
  page: number;
}

const positive = (v: string) => (/^[1-9]\d{0,8}$/.test(v) ? Number(v) : null);

export function parseBillFilter(params: Record<string, string | string[] | undefined>): BillFilter {
  const text = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v.trim() : "";
  };
  const day = text("day");
  // A date that does not read back as itself does not exist.
  const realDay = /^\d{4}-\d{2}-\d{2}$/.test(day) && dayKey(dayStartMs(day)) === day;
  return {
    day: realDay ? day : "",
    lottoId: positive(text("lotto")),
    status: BILL_STATUSES.find((s) => s === text("status")) ?? "all",
    search: text("q").slice(0, 40),
    page: positive(text("page")) ?? 1,
  };
}

/** The WHERE clause over bills `b`, rounds `r` and users `u`. */
export function billWhere(f: BillFilter): { sql: string; params: (string | number)[] } {
  const parts = ["u.is_simulated = 0"];
  const params: (string | number)[] = [];
  if (f.day) {
    const from = dayStartMs(f.day);
    parts.push("b.created_at >= ? AND b.created_at < ?");
    params.push(from, from + DAY);
  }
  if (f.lottoId !== null) {
    parts.push("r.lotto_id = ?");
    params.push(f.lottoId);
  }
  if (f.status !== "all") {
    parts.push("b.status = ?");
    params.push(f.status);
  }
  if (f.search) {
    const like = `%${f.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    parts.push("(b.code LIKE ? OR u.phone LIKE ? OR u.name LIKE ?)");
    params.push(like, like, like);
  }
  return { sql: parts.join(" AND "), params };
}

export function billQuery(f: BillFilter): string {
  const p = new URLSearchParams();
  if (f.day) p.set("day", f.day);
  if (f.lottoId !== null) p.set("lotto", String(f.lottoId));
  if (f.status !== "all") p.set("status", f.status);
  if (f.search) p.set("q", f.search);
  if (f.page > 1) p.set("page", String(f.page));
  return p.size ? `?${p}` : "";
}

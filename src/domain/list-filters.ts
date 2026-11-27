/** Filters of the back office's list pages: read from the address, turned into SQL, written back into links. */
import { isBetTypeCode } from "@/core/rules/betTypes";
import { addDays, DAY, dayKey, dayStartMs } from "@/core/rules/time";
import type { BetTypeCode } from "@/core/rules/types";

export const LIST_PAGE = 50;

type Params = Record<string, string | string[] | undefined>;

const reader = (params: Params) => (key: string) => {
  const v = params[key];
  return typeof v === "string" ? v.trim() : "";
};
const pageOf = (v: string) => (/^[1-9]\d{0,8}$/.test(v) ? Number(v) : 1);
/** A date that does not read back as itself does not exist. */
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && dayKey(dayStartMs(v)) === v;
/** `%` and `_` typed by staff are themselves. */
const likeText = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const query = (entries: [string, string][]) => {
  const p = new URLSearchParams(entries.filter(([, v]) => v));
  return p.size ? `?${p}` : "";
};
const pageEntry = (page: number): [string, string] => ["page", page > 1 ? String(page) : ""];

/* ---------- the ledger ---------- */

export const TX_TYPES = [
  "deposit", "bonus", "withdraw", "withdraw_refund", "debt_repay", "bet", "win", "refund", "win_correction", "cashback_earn",
  "cashback_claim", "cashback_correction", "aff_earn", "aff_transfer", "aff_correction", "voucher", "adjust", "game",
] as const;
export const WALLETS = ["balance", "cashback", "affiliate"] as const;

export interface LedgerFilter {
  from: string;
  to: string;
  type: (typeof TX_TYPES)[number] | "";
  wallet: (typeof WALLETS)[number] | "";
  search: string;
  page: number;
}

export function parseLedgerFilter(params: Params, today: string): LedgerFilter {
  const text = reader(params);
  const to = isDay(text("to")) ? text("to") : today;
  const from = isDay(text("from")) ? text("from") : addDays(to, -6);
  return {
    // "YYYY-MM-DD" compares as text.
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    type: TX_TYPES.find((t) => t === text("type")) ?? "",
    wallet: WALLETS.find((w) => w === text("wallet")) ?? "",
    search: text("q").slice(0, 40),
    page: pageOf(text("page")),
  };
}

/** The WHERE clause over transactions `t` and users `u`. */
export function ledgerWhere(f: LedgerFilter): { sql: string; params: (string | number)[] } {
  const parts = ["u.is_simulated = 0", "t.created_at >= ? AND t.created_at < ?"];
  const params: (string | number)[] = [dayStartMs(f.from), dayStartMs(f.to) + DAY];
  if (f.type) {
    parts.push("t.type = ?");
    params.push(f.type);
  }
  if (f.wallet) {
    parts.push("t.wallet = ?");
    params.push(f.wallet);
  }
  if (f.search) {
    parts.push("(t.ref LIKE ? OR u.phone LIKE ? OR u.name LIKE ?)");
    const like = likeText(f.search);
    params.push(like, like, like);
  }
  return { sql: parts.join(" AND "), params };
}

export const ledgerQuery = (f: LedgerFilter) => query([["from", f.from], ["to", f.to], ["type", f.type], ["wallet", f.wallet], ["q", f.search], pageEntry(f.page)]);

/* ---------- exposure across draws ---------- */

export const EXPOSURE_STATES = ["open", "waiting", "all"] as const;

export interface ExposureFilter {
  /** Draws taking bets, draws closed and waiting for a result, or both. */
  state: (typeof EXPOSURE_STATES)[number];
  betType: BetTypeCode | "";
  group: string;
}

export function parseExposureFilter(params: Params): ExposureFilter {
  const text = reader(params);
  const type = text("type");
  return {
    state: EXPOSURE_STATES.find((s) => s === text("state")) ?? "open",
    betType: isBetTypeCode(type) ? type : "",
    group: text("group").slice(0, 40),
  };
}

/** The WHERE clause over exposures `e` and rounds `r`. The group is narrowed by lottery ids, by the reader. */
export function exposureWhere(f: ExposureFilter, now: number): { sql: string; params: (string | number)[] } {
  const parts = ["r.status = 'scheduled'", "e.total_stake > 0"];
  const params: (string | number)[] = [];
  if (f.state !== "all") {
    parts.push(f.state === "open" ? "r.closes_at > ?" : "r.closes_at <= ?");
    params.push(now);
  }
  if (f.betType) {
    parts.push("e.bet_type = ?");
    params.push(f.betType);
  }
  return { sql: parts.join(" AND "), params };
}

export const exposureQuery = (f: ExposureFilter) => query([["state", f.state === "open" ? "" : f.state], ["type", f.betType], ["group", f.group]]);

/* ---------- referrals ---------- */

export interface ReferralFilter {
  search: string;
  page: number;
}

export function parseReferralFilter(params: Params): ReferralFilter {
  const text = reader(params);
  return { search: text("q").slice(0, 40), page: pageOf(text("page")) };
}

export const referralQuery = (f: ReferralFilter) => query([["q", f.search], pageEntry(f.page)]);

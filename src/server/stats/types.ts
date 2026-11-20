/**
 * Summary documents (MongoDB `stats_*` collections). All money is integer satang, exactly as in
 * MariaDB. "Placed" means bills with status pending/won/lost counted by `created_at`; "settled"
 * means won/lost counted by `settled_at` — the same filters the reports used on raw rows.
 */

/** Bills placed on a lotto that day (by created_at), with what has happened to them since. */
export interface LottoDay {
  bills: number;
  stake: number;
  /** stake of those bills that are now won/lost */
  settled: number;
  payout: number;
  /** distinct round ids, so a round that took bills on several days counts once */
  rounds: number[];
}

/** Bill items of bills placed that day (item status pending/won/lost). `stake` is in baht, as in bill_items. */
export interface BetTypeDay {
  items: number;
  won: number;
  stake: number;
  potential: number;
  payout: number;
  settled: number;
}

export interface MoneyDay {
  n: number;
  sum: number;
  /** 24 Bangkok hours */
  hours: number[];
}

export interface DayStats {
  /** Bangkok day number: floor((ms + offset) / DAY) */
  _id: number;
  builtAt: number;
  lottos: Record<string, LottoDay>;
  /** 24 Bangkok hours, by created_at */
  placedHours: { bills: number; stake: number }[];
  betTypes: Record<string, BetTypeDay>;
  /** 24 Bangkok hours, by settled_at, won/lost bills */
  settledHours: { stake: number; payout: number }[];
  /** "wallet:type" → sum of amounts, by created_at */
  tx: Record<string, number>;
  /** approved, by reviewed_at */
  deposits: MoneyDay;
  withdrawals: MoneyDay;
  /** real (not simulated) members who joined */
  members: number;
  /** members who joined through a referral link */
  referred: number;
  /** first deposits approved that day: count and the first approved amount of each */
  ftd: { n: number; sum: number };
}

/** One player on one day: what they placed (by created_at) and their money moves. */
export interface UserDay {
  _id: string;
  d: number;
  u: number;
  bills: number;
  stake: number;
  settled: number;
  payout: number;
  /** lotto ids they placed bills on that day */
  lottos: number[];
  dep: number;
  wd: number;
  /** referral income credited that day */
  affEarn: number;
}

export type UserTotals = Pick<UserDay, "u" | "bills" | "stake" | "settled" | "payout" | "dep" | "wd" | "affEarn">;

/** A finished round (settled or cancelled): what the rounds report shows. Placed bills only. */
export interface RoundStats {
  _id: number;
  lottoId: number;
  roundNo: number | null;
  closesAt: number;
  status: string;
  result: string | null;
  bills: number;
  stake: number;
  payout: number;
  builtAt: number;
}

export interface BuiltSpan {
  days: DayStats[];
  users: UserDay[];
}

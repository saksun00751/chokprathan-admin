import { bucketsOf, type DateRange } from "@/domain/periods";
import { BKK_OFFSET_MS, DAY, MINUTE } from "chokprathan-core/rules/time";
import type { BetTypeDay, DayStats, UserTotals } from "./types";

/** Pure arithmetic over summary documents. Nothing here touches a database. */

export const dayOf = (ms: number) => Math.floor((ms + BKK_OFFSET_MS) / DAY);
export const dayStartOf = (d: number) => d * DAY - BKK_OFFSET_MS;

export function daysIn(r: DateRange): number[] {
  const out: number[] = [];
  for (let d = dayOf(r.startMs); dayStartOf(d) < r.endMs; d++) out.push(d);
  return out;
}

const hours = <T>(make: () => T): T[] => Array.from({ length: 24 }, make);

export function emptyDay(d: number, builtAt = 0): DayStats {
  return {
    _id: d,
    builtAt,
    lottos: {},
    placedHours: hours(() => ({ bills: 0, stake: 0 })),
    betTypes: {},
    settledHours: hours(() => ({ stake: 0, payout: 0 })),
    tx: {},
    deposits: { n: 0, sum: 0, hours: hours(() => 0) },
    withdrawals: { n: 0, sum: 0, hours: hours(() => 0) },
    members: 0,
    referred: 0,
    ftd: { n: 0, sum: 0 },
  };
}

export function sumPlaced(days: DayStats[]) {
  let bills = 0;
  let stake = 0;
  for (const d of days) {
    for (const l of Object.values(d.lottos)) {
      bills += l.bills;
      stake += l.stake;
    }
  }
  return { bills, stake };
}

export function sumSettled(days: DayStats[]) {
  let stake = 0;
  let payout = 0;
  for (const d of days) {
    for (const h of d.settledHours) {
      stake += h.stake;
      payout += h.payout;
    }
  }
  return { stake, payout };
}

/** Rewards earned, net of what a result correction paid or took back. */
export const CASHBACK_TYPES = ["cashback_earn", "cashback_correction"] as const;
export const AFFILIATE_TYPES = ["aff_earn", "aff_correction"] as const;

/** Sum of transactions of the given types, optionally only from the given wallets. */
export function sumTx(days: DayStats[], types: readonly string[], wallets?: readonly string[]): number {
  let s = 0;
  for (const d of days) {
    for (const [key, amount] of Object.entries(d.tx)) {
      const [wallet, type] = key.split(":");
      if (types.includes(type) && (!wallets || wallets.includes(wallet))) s += amount;
    }
  }
  return s;
}

export function sumMoney(days: DayStats[]) {
  const out = { deposits: { n: 0, sum: 0 }, withdrawals: { n: 0, sum: 0 }, members: 0, referred: 0, ftd: { n: 0, sum: 0 } };
  for (const d of days) {
    out.deposits.n += d.deposits.n;
    out.deposits.sum += d.deposits.sum;
    out.withdrawals.n += d.withdrawals.n;
    out.withdrawals.sum += d.withdrawals.sum;
    out.members += d.members;
    out.referred += d.referred;
    out.ftd.n += d.ftd.n;
    out.ftd.sum += d.ftd.sum;
  }
  return out;
}

export type LottoTotals = { bills: number; stake: number; settled: number; payout: number; rounds: number };

export function sumLottos(days: DayStats[]): Map<number, LottoTotals> {
  const acc = new Map<number, Omit<LottoTotals, "rounds"> & { rounds: Set<number> }>();
  for (const d of days) {
    for (const [id, l] of Object.entries(d.lottos)) {
      const key = Number(id);
      const a = acc.get(key) ?? { bills: 0, stake: 0, settled: 0, payout: 0, rounds: new Set<number>() };
      a.bills += l.bills;
      a.stake += l.stake;
      a.settled += l.settled;
      a.payout += l.payout;
      for (const r of l.rounds) a.rounds.add(r);
      acc.set(key, a);
    }
  }
  return new Map([...acc].map(([id, a]) => [id, { ...a, rounds: a.rounds.size }]));
}

export function sumBetTypes(days: DayStats[]): Record<string, BetTypeDay> {
  const out: Record<string, BetTypeDay> = {};
  for (const d of days) {
    for (const [type, b] of Object.entries(d.betTypes)) {
      const a = (out[type] ??= { items: 0, won: 0, stake: 0, potential: 0, payout: 0, settled: 0 });
      a.items += b.items;
      a.won += b.won;
      a.stake += b.stake;
      a.potential += b.potential;
      a.payout += b.payout;
      a.settled += b.settled;
    }
  }
  return out;
}

/** Chart values per Bangkok hour (one-day ranges) or per day, every bucket present. */
export function seriesOf(r: DateRange, days: DayStats[], label: (startMs: number) => string) {
  const byDay = new Map(days.map((x) => [x._id, x]));
  return bucketsOf(r, label).map((k) => {
    if (r.bucket === "hour") {
      const d = Math.floor(k.key / 24);
      const h = k.key - d * 24;
      const x = byDay.get(d);
      return {
        label: k.label,
        startMs: k.startMs,
        turnover: x?.placedHours[h].stake ?? 0,
        ggr: x ? x.settledHours[h].stake - x.settledHours[h].payout : 0,
        deposits: x?.deposits.hours[h] ?? 0,
        withdrawals: x?.withdrawals.hours[h] ?? 0,
      };
    }
    const x = byDay.get(k.key);
    const settled = x ? sumSettled([x]) : { stake: 0, payout: 0 };
    return {
      label: k.label,
      startMs: k.startMs,
      turnover: x ? x.placedHours.reduce((s, h) => s + h.stake, 0) : 0,
      ggr: settled.stake - settled.payout,
      deposits: x?.deposits.sum ?? 0,
      withdrawals: x?.withdrawals.sum ?? 0,
    };
  });
}

/** Per-player totals in order of first appearance (the same grouping MongoDB does with $group). */
export function groupUsers(rows: UserTotals[]): UserTotals[] {
  const out = new Map<number, UserTotals>();
  for (const r of rows) {
    const a = out.get(r.u);
    if (!a) {
      out.set(r.u, { u: r.u, bills: r.bills, stake: r.stake, settled: r.settled, payout: r.payout, dep: r.dep, wd: r.wd, affEarn: r.affEarn });
      continue;
    }
    a.bills += r.bills;
    a.stake += r.stake;
    a.settled += r.settled;
    a.payout += r.payout;
    a.dep += r.dep;
    a.wd += r.wd;
    a.affEarn += r.affEarn;
  }
  return [...out.values()];
}

/**
 * Which days one rollup run rebuilds: today always, yesterday again just after midnight (late
 * commits), then days whose bills changed status, then missing days — newest first, at most
 * `budget` beyond today and yesterday.
 */
export function planRollup({ now, changed, missing, budget }: { now: number; changed: number[]; missing: number[]; budget: number }): number[] {
  const today = dayOf(now);
  const plan = [today];
  if (now - dayStartOf(today) < 15 * MINUTE) plan.push(today - 1);
  const extra = [...new Set(changed)].filter((d) => d < today && !plan.includes(d));
  const backfill = [...new Set(missing)].filter((d) => d < today && !plan.includes(d) && !extra.includes(d)).sort((a, b) => b - a);
  return [...plan, ...[...extra, ...backfill].slice(0, budget)];
}

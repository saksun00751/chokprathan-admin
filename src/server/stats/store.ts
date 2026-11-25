import "server-only";
import type { Db } from "mongodb";
import type { DateRange } from "@/domain/periods";
import { MINUTE } from "chokprathan-core/rules/time";
import { COLL, mongoDb } from "@/server/mongo";
import { buildRounds, buildSpan, finishedRoundIds, unfinishedRounds } from "./build";
import { dayOf, daysIn, emptyDay, groupUsers } from "./derive";
import { loadDays } from "./load";
import type { BuiltSpan, DayStats, RoundStats, UserDay, UserTotals } from "./types";

/**
 * Summary statistics for a date range: from MongoDB when it is up (missing or stale days are built
 * from MariaDB and saved on the way), otherwise built in memory from MariaDB with the same queries.
 */

const BATCH = 1000;

export type RollupMeta = { _id: string; cursor: number; dirty: number[]; ranAt: number; complete: boolean };

export async function saveSpan(db: Db, span: BuiltSpan) {
  const userDays = db.collection<UserDay>(COLL.statsUserDays);
  const byDay = new Map<number, UserDay[]>();
  for (const u of span.users) byDay.set(u.d, [...(byDay.get(u.d) ?? []), u]);
  // Players first: a stored day document means its players are stored too.
  for (const day of span.days) {
    const rows = byDay.get(day._id) ?? [];
    for (let i = 0; i < rows.length; i += BATCH) {
      await userDays.bulkWrite(
        rows.slice(i, i + BATCH).map((u) => ({ replaceOne: { filter: { _id: u._id }, replacement: u, upsert: true } })),
        { ordered: false },
      );
    }
    await userDays.deleteMany({ d: day._id, _id: { $nin: rows.map((u) => u._id) } });
  }
  if (span.days.length) {
    await db
      .collection<DayStats>(COLL.statsDays)
      .bulkWrite(span.days.map((x) => ({ replaceOne: { filter: { _id: x._id }, replacement: x, upsert: true } })), { ordered: false });
  }
}

export async function saveRounds(db: Db, rounds: RoundStats[]) {
  if (rounds.length === 0) return;
  await db
    .collection<RoundStats>(COLL.statsRounds)
    .bulkWrite(rounds.map((x) => ({ replaceOne: { filter: { _id: x._id }, replacement: x, upsert: true } })), { ordered: false });
}

export interface UserQuery {
  /** only players who placed bills in the range */
  bettorsOnly?: boolean;
  sortBy?: "stake" | "affEarn";
  limit?: number;
}

export interface RangeStats {
  days: DayStats[];
  users(query?: UserQuery): Promise<UserTotals[]>;
  /** distinct players who placed bills */
  players(): Promise<number>;
  playersPerLotto(): Promise<Map<number, number>>;
  playersPerDay(): Promise<Map<number, number>>;
}

function shape(rows: UserTotals[], query: UserQuery): UserTotals[] {
  let out = query.bettorsOnly ? rows.filter((x) => x.bills > 0) : rows;
  if (query.sortBy) {
    const key = query.sortBy;
    out = [...out].sort((a, b) => b[key] - a[key] || a.u - b.u);
  }
  return query.limit ? out.slice(0, query.limit) : out;
}

function memoryRange(days: DayStats[], users: UserDay[]): RangeStats {
  const bettors = users.filter((x) => x.bills > 0);
  return {
    days,
    users: async (query = {}) => shape(groupUsers(users), query),
    players: async () => new Set(bettors.map((x) => x.u)).size,
    playersPerLotto: async () => {
      const sets = new Map<number, Set<number>>();
      for (const x of bettors) for (const l of x.lottos) sets.set(l, (sets.get(l) ?? new Set()).add(x.u));
      return new Map([...sets].map(([l, s]) => [l, s.size]));
    },
    playersPerDay: async () => {
      const out = new Map<number, number>();
      for (const x of bettors) out.set(x.d, (out.get(x.d) ?? 0) + 1);
      return out;
    },
  };
}

function mongoRange(db: Db, ids: number[], days: DayStats[]): RangeStats {
  const userDays = db.collection<UserDay>(COLL.statsUserDays);
  const match = { d: { $gte: ids[0], $lte: ids[ids.length - 1] } };
  const sum = (field: string) => ({ $sum: `$${field}` });
  return {
    days,
    users: async (query = {}) => {
      const rows = await userDays
        .aggregate<UserTotals & { _id: number }>([
          { $match: match },
          { $group: { _id: "$u", bills: sum("bills"), stake: sum("stake"), settled: sum("settled"), payout: sum("payout"), dep: sum("dep"), wd: sum("wd"), affEarn: sum("affEarn") } },
          ...(query.bettorsOnly ? [{ $match: { bills: { $gt: 0 } } }] : []),
          ...(query.sortBy ? [{ $sort: { [query.sortBy]: -1, _id: 1 } }] : []),
          ...(query.limit ? [{ $limit: query.limit }] : []),
        ])
        .toArray();
      return rows.map(({ _id, ...x }) => ({ ...x, u: _id }));
    },
    players: async () => {
      const [row] = await userDays.aggregate<{ n: number }>([{ $match: { ...match, bills: { $gt: 0 } } }, { $group: { _id: "$u" } }, { $count: "n" }]).toArray();
      return row?.n ?? 0;
    },
    playersPerLotto: async () => {
      const rows = await userDays
        .aggregate<{ _id: number; n: number }>([
          { $match: { ...match, bills: { $gt: 0 } } },
          { $unwind: "$lottos" },
          { $group: { _id: { l: "$lottos", u: "$u" } } },
          { $group: { _id: "$_id.l", n: { $sum: 1 } } },
        ])
        .toArray();
      return new Map(rows.map((x) => [x._id, x.n]));
    },
    playersPerDay: async () => {
      const rows = await userDays.aggregate<{ _id: number; n: number }>([{ $match: { ...match, bills: { $gt: 0 } } }, { $group: { _id: "$d", n: { $sum: 1 } } }]).toArray();
      return new Map(rows.map((x) => [x._id, x.n]));
    },
  };
}

export async function rangeStats(r: DateRange, now = Date.now()): Promise<RangeStats> {
  const ids = daysIn(r);
  const db = await mongoDb();
  if (db) {
    try {
      const days = await loadDays(
        {
          now,
          load: (x) => db.collection<DayStats>(COLL.statsDays).find({ _id: { $in: x } }).toArray(),
          build: (from, to) => buildSpan(from, to, now),
          save: (span) => saveSpan(db, span),
        },
        ids,
      );
      return mongoRange(db, ids, days);
    } catch (error) {
      console.error("[stats] using MariaDB directly:", error instanceof Error ? error.message : error);
    }
  }
  const today = dayOf(now);
  const last = Math.min(ids[ids.length - 1], today);
  const built = last >= ids[0] ? await buildSpan(ids[0], last, now) : { days: [], users: [] };
  const byId = new Map(built.days.map((x) => [x._id, x]));
  return memoryRange(
    ids.map((d) => byId.get(d) ?? emptyDay(d, now)),
    built.users,
  );
}

/** Rounds closing in the range: finished ones from their snapshots (made on demand), the rest live. */
export async function roundStats(r: DateRange, now = Date.now()): Promise<RoundStats[]> {
  const [finishedIds, live] = await Promise.all([finishedRoundIds(r), unfinishedRounds(r, now)]);
  const db = await mongoDb();
  let stored: RoundStats[] = [];
  let canSave = !!db;
  if (db && finishedIds.length) {
    try {
      stored = await db.collection<RoundStats>(COLL.statsRounds).find({ _id: { $in: finishedIds } }).toArray();
    } catch {
      canSave = false;
    }
  }
  const have = new Set(stored.map((x) => x._id));
  const missing = finishedIds.filter((id) => !have.has(id));
  const built: RoundStats[] = [];
  for (let i = 0; i < missing.length; i += 500) built.push(...(await buildRounds(missing.slice(i, i + 500), now)));
  if (db && canSave) await saveRounds(db, built).catch(() => {});
  return [...stored, ...built, ...live];
}

/**
 * All-time settled stake and referral income per player, for the affiliate page. Null (answer from
 * MariaDB) unless every past day is summarised and the rollup ran in the last few minutes.
 */
export async function allTimeByUser(ids: number[]): Promise<Map<number, { settled: number; affEarn: number }> | null> {
  const db = await mongoDb();
  if (!db) return null;
  try {
    const meta = await db.collection<RollupMeta>(COLL.statsMeta).findOne({ _id: "rollup" });
    if (!meta?.complete || Date.now() - meta.ranAt > 5 * MINUTE) return null;
    if (ids.length === 0) return new Map();
    const rows = await db
      .collection<UserDay>(COLL.statsUserDays)
      .aggregate<{ _id: number; settled: number; affEarn: number }>([
        { $match: { u: { $in: ids } } },
        { $group: { _id: "$u", settled: { $sum: "$settled" }, affEarn: { $sum: "$affEarn" } } },
      ])
      .toArray();
    return new Map(rows.map((x) => [x._id, { settled: x.settled, affEarn: x.affEarn }]));
  } catch {
    return null;
  }
}

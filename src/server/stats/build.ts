import "server-only";
import type { DateRange } from "@/domain/periods";
import { BKK_OFFSET_MS, DAY, HOUR } from "chokprathan-core/rules/time";
import { q, q1 } from "@/server/db";
import { dayOf, dayStartOf, emptyDay } from "./derive";
import type { BuiltSpan, DayStats, RoundStats, UserDay } from "./types";

/**
 * Builds summary documents from MariaDB. Every filter below is copied from the report and
 * dashboard queries that used to run on raw rows, only grouped by Bangkok day (or hour) so a
 * finished day can be stored and summed later.
 */

const LIVE = "('pending','won','lost')";
const SETTLED = "('won','lost')";
const DK = (col: string) => `((${col} + ${BKK_OFFSET_MS}) DIV ${DAY})`;
const HK = (col: string) => `((${col} + ${BKK_OFFSET_MS}) DIV ${HOUR})`;
const num = (v: number | string | null | undefined) => Number(v ?? 0);

/** Days `from`..`to` (inclusive, Bangkok day numbers) with every player's day. */
export async function buildSpan(from: number, to: number, now = Date.now()): Promise<BuiltSpan> {
  const span = [dayStartOf(from), dayStartOf(to + 1)];
  const [lottos, rounds, placedHours, placedUsers, userLottos, betTypes, settledHours, tx, affEarn, deposits, withdrawals, members, referred, ftd] =
    await Promise.all([
      q<{ dk: number; lotto_id: number; bills: number; stake: number | null; settled: number | null; payout: number | null }>(
        `SELECT ${DK("b.created_at")} AS dk, r.lotto_id, COUNT(*) AS bills, SUM(b.total_stake) AS stake,
                SUM(CASE WHEN b.status IN ${SETTLED} THEN b.total_stake ELSE 0 END) AS settled, SUM(b.total_payout) AS payout
         FROM bills b JOIN rounds r ON r.id = b.round_id
         WHERE b.created_at >= ? AND b.created_at < ? AND b.status IN ${LIVE} GROUP BY dk, r.lotto_id`,
        ...span,
      ),
      q<{ dk: number; lotto_id: number; round_id: number }>(
        `SELECT DISTINCT ${DK("b.created_at")} AS dk, r.lotto_id, b.round_id
         FROM bills b JOIN rounds r ON r.id = b.round_id
         WHERE b.created_at >= ? AND b.created_at < ? AND b.status IN ${LIVE}`,
        ...span,
      ),
      q<{ hk: number; bills: number; stake: number | null }>(
        `SELECT ${HK("created_at")} AS hk, COUNT(*) AS bills, SUM(total_stake) AS stake
         FROM bills WHERE created_at >= ? AND created_at < ? AND status IN ${LIVE} GROUP BY hk`,
        ...span,
      ),
      q<{ dk: number; user_id: number; bills: number; stake: number | null; settled: number | null; payout: number | null }>(
        `SELECT ${DK("created_at")} AS dk, user_id, COUNT(*) AS bills, SUM(total_stake) AS stake,
                SUM(CASE WHEN status IN ${SETTLED} THEN total_stake ELSE 0 END) AS settled, SUM(total_payout) AS payout
         FROM bills WHERE created_at >= ? AND created_at < ? AND status IN ${LIVE} GROUP BY dk, user_id`,
        ...span,
      ),
      q<{ dk: number; user_id: number; lotto_id: number }>(
        `SELECT DISTINCT ${DK("b.created_at")} AS dk, b.user_id, r.lotto_id
         FROM bills b JOIN rounds r ON r.id = b.round_id
         WHERE b.created_at >= ? AND b.created_at < ? AND b.status IN ${LIVE}`,
        ...span,
      ),
      q<{ dk: number; bet_type: string; items: number; stake: number | null; potential: number | null; payout: number | null; settled: number | null; won: number | null }>(
        `SELECT ${DK("b.created_at")} AS dk, i.bet_type, COUNT(*) AS items, SUM(i.stake) AS stake, SUM(i.potential) AS potential, SUM(i.payout) AS payout,
                SUM(CASE WHEN i.status IN ${SETTLED} THEN i.stake ELSE 0 END) AS settled,
                SUM(CASE WHEN i.status = 'won' THEN 1 ELSE 0 END) AS won
         FROM bill_items i JOIN bills b ON b.id = i.bill_id
         WHERE b.created_at >= ? AND b.created_at < ? AND i.status IN ${LIVE} GROUP BY dk, i.bet_type`,
        ...span,
      ),
      q<{ hk: number; stake: number | null; payout: number | null }>(
        `SELECT ${HK("settled_at")} AS hk, SUM(total_stake) AS stake, SUM(total_payout) AS payout
         FROM bills WHERE settled_at >= ? AND settled_at < ? AND status IN ${SETTLED} GROUP BY hk`,
        ...span,
      ),
      q<{ dk: number; wallet: string; type: string; s: number | null }>(
        `SELECT ${DK("created_at")} AS dk, wallet, type, SUM(amount) AS s
         FROM transactions WHERE created_at >= ? AND created_at < ? GROUP BY dk, wallet, type`,
        ...span,
      ),
      q<{ dk: number; user_id: number; s: number | null }>(
        `SELECT ${DK("created_at")} AS dk, user_id, SUM(amount) AS s
         FROM transactions WHERE created_at >= ? AND created_at < ? AND type = 'aff_earn' GROUP BY dk, user_id`,
        ...span,
      ),
      q<{ hk: number; user_id: number; n: number; s: number | null }>(
        `SELECT ${HK("reviewed_at")} AS hk, user_id, COUNT(*) AS n, SUM(amount) AS s
         FROM deposits WHERE status = 'approved' AND reviewed_at >= ? AND reviewed_at < ? GROUP BY hk, user_id`,
        ...span,
      ),
      q<{ hk: number; user_id: number; n: number; s: number | null }>(
        `SELECT ${HK("reviewed_at")} AS hk, user_id, COUNT(*) AS n, SUM(amount) AS s
         FROM withdrawals WHERE status = 'approved' AND reviewed_at >= ? AND reviewed_at < ? GROUP BY hk, user_id`,
        ...span,
      ),
      q<{ dk: number; n: number }>(
        `SELECT ${DK("created_at")} AS dk, COUNT(*) AS n FROM users
         WHERE role = 'member' AND is_simulated = 0 AND created_at >= ? AND created_at < ? GROUP BY dk`,
        ...span,
      ),
      q<{ dk: number; n: number }>(
        `SELECT ${DK("created_at")} AS dk, COUNT(*) AS n FROM users
         WHERE role = 'member' AND upline1_id IS NOT NULL AND created_at >= ? AND created_at < ? GROUP BY dk`,
        ...span,
      ),
      q<{ dk: number; n: number; s: number | null }>(
        `SELECT ${DK("u.first_deposit_at")} AS dk, COUNT(*) AS n,
                SUM((SELECT x.amount FROM deposits x WHERE x.user_id = u.id AND x.status = 'approved' ORDER BY x.reviewed_at LIMIT 1)) AS s
         FROM users u WHERE u.first_deposit_at >= ? AND u.first_deposit_at < ? GROUP BY dk`,
        ...span,
      ),
    ]);

  const days = new Map<number, DayStats>();
  for (let d = from; d <= to; d++) days.set(d, emptyDay(d, now));
  const day = (dk: number) => days.get(num(dk));
  const slot = (hk: number) => {
    const d = Math.floor(num(hk) / 24);
    return { x: days.get(d), h: num(hk) - d * 24 };
  };
  const users = new Map<string, UserDay>();
  const user = (dk: number, u: number): UserDay => {
    const id = `${num(dk)}:${num(u)}`;
    let x = users.get(id);
    if (!x) {
      x = { _id: id, d: num(dk), u: num(u), bills: 0, stake: 0, settled: 0, payout: 0, lottos: [], dep: 0, wd: 0, affEarn: 0 };
      users.set(id, x);
    }
    return x;
  };

  for (const r of lottos) {
    const x = day(r.dk);
    if (x) x.lottos[String(r.lotto_id)] = { bills: num(r.bills), stake: num(r.stake), settled: num(r.settled), payout: num(r.payout), rounds: [] };
  }
  for (const r of rounds) day(r.dk)?.lottos[String(r.lotto_id)]?.rounds.push(num(r.round_id));
  for (const x of days.values()) for (const l of Object.values(x.lottos)) l.rounds.sort((a, b) => a - b);
  for (const r of placedHours) {
    const { x, h } = slot(r.hk);
    if (x) x.placedHours[h] = { bills: num(r.bills), stake: num(r.stake) };
  }
  for (const r of betTypes) {
    const x = day(r.dk);
    if (x) x.betTypes[r.bet_type] = { items: num(r.items), won: num(r.won), stake: num(r.stake), potential: num(r.potential), payout: num(r.payout), settled: num(r.settled) };
  }
  for (const r of settledHours) {
    const { x, h } = slot(r.hk);
    if (x) x.settledHours[h] = { stake: num(r.stake), payout: num(r.payout) };
  }
  for (const r of tx) {
    const x = day(r.dk);
    if (x) x.tx[`${r.wallet}:${r.type}`] = num(r.s);
  }
  for (const [rows, key] of [
    [deposits, "deposits"],
    [withdrawals, "withdrawals"],
  ] as const) {
    for (const r of rows) {
      const { x, h } = slot(r.hk);
      if (!x) continue;
      x[key].n += num(r.n);
      x[key].sum += num(r.s);
      x[key].hours[h] += num(r.s);
      const u = user(x._id, r.user_id);
      if (key === "deposits") u.dep += num(r.s);
      else u.wd += num(r.s);
    }
  }
  for (const r of members) {
    const x = day(r.dk);
    if (x) x.members = num(r.n);
  }
  for (const r of referred) {
    const x = day(r.dk);
    if (x) x.referred = num(r.n);
  }
  for (const r of ftd) {
    const x = day(r.dk);
    if (x) x.ftd = { n: num(r.n), sum: num(r.s) };
  }

  for (const r of placedUsers) {
    if (!day(r.dk)) continue;
    Object.assign(user(r.dk, r.user_id), { bills: num(r.bills), stake: num(r.stake), settled: num(r.settled), payout: num(r.payout) });
  }
  for (const r of userLottos) if (day(r.dk)) user(r.dk, r.user_id).lottos.push(num(r.lotto_id));
  for (const r of affEarn) if (day(r.dk)) user(r.dk, r.user_id).affEarn = num(r.s);
  for (const u of users.values()) u.lottos.sort((a, b) => a - b);

  return { days: [...days.values()], users: [...users.values()] };
}

/** Days with bills whose status changed since `sinceMs`: every change after placement stamps settled_at. */
export async function changedDays(sinceMs: number): Promise<number[]> {
  const rows = await q<{ dk: number }>(`SELECT DISTINCT ${DK("created_at")} AS dk FROM bills WHERE settled_at >= ?`, sinceMs);
  return rows.map((r) => num(r.dk));
}

/** The first day anything happened (bills, members, money), or null on an empty install. */
export async function firstDay(): Promise<number | null> {
  const r = await q1<{ m: number | null }>(
    `SELECT LEAST(COALESCE((SELECT MIN(created_at) FROM bills), 9e15),
                  COALESCE((SELECT MIN(created_at) FROM users WHERE role = 'member'), 9e15),
                  COALESCE((SELECT MIN(created_at) FROM transactions), 9e15)) AS m`,
  );
  const m = num(r?.m);
  return m > 0 && m < 9e15 ? dayOf(m) : null;
}

const ROUND_SQL = `SELECT rd.id, rd.lotto_id, rd.round_no, rd.closes_at, rd.status, rd.result,
         COUNT(b.id) AS bills, SUM(b.total_stake) AS stake, SUM(b.total_payout) AS payout
  FROM rounds rd LEFT JOIN bills b ON b.round_id = rd.id AND b.status IN ${LIVE}`;
const ROUND_GROUP = "GROUP BY rd.id, rd.lotto_id, rd.round_no, rd.closes_at, rd.status, rd.result";

type RoundRow = { id: number; lotto_id: number; round_no: number | null; closes_at: number; status: string; result: string | null; bills: number; stake: number | null; payout: number | null };
const toRoundStats = (r: RoundRow, now: number): RoundStats => ({
  _id: num(r.id),
  lottoId: num(r.lotto_id),
  roundNo: r.round_no === null ? null : num(r.round_no),
  closesAt: num(r.closes_at),
  status: r.status,
  result: r.result,
  bills: num(r.bills),
  stake: num(r.stake),
  payout: num(r.payout),
  builtAt: now,
});

/** Finished rounds by id (their totals no longer change). */
export async function buildRounds(ids: number[], now = Date.now()): Promise<RoundStats[]> {
  if (ids.length === 0) return [];
  return (await q<RoundRow>(`${ROUND_SQL} WHERE rd.id IN (?) ${ROUND_GROUP}`, ids)).map((r) => toRoundStats(r, now));
}

/** Rounds in the range that are not finished yet, read live. */
export async function unfinishedRounds(r: DateRange, now = Date.now()): Promise<RoundStats[]> {
  return (await q<RoundRow>(`${ROUND_SQL} WHERE rd.closes_at >= ? AND rd.closes_at < ? AND rd.settled_at IS NULL ${ROUND_GROUP}`, r.startMs, r.endMs)).map((x) => toRoundStats(x, now));
}

export async function finishedRoundIds(r: DateRange): Promise<number[]> {
  return (await q<{ id: number }>("SELECT id FROM rounds WHERE closes_at >= ? AND closes_at < ? AND settled_at IS NOT NULL", r.startMs, r.endMs)).map((x) => num(x.id));
}

export async function roundsFinishedSince(sinceMs: number): Promise<number[]> {
  return (await q<{ id: number }>("SELECT id FROM rounds WHERE status IN ('resulted','cancelled') AND settled_at >= ?", sinceMs)).map((x) => num(x.id));
}

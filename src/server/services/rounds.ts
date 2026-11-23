import "server-only";
import { settleGuesses } from "./activities";
import { errorsT, serverI18n } from "@/i18n/server";
import { randomInt } from "node:crypto";
import { deriveResult, type ResultInput } from "@/domain/match";
import { closesForDay, nextClose, opensOnDay, previousClose } from "@/domain/schedule";
import { DAY, addDays, dayKey, formatThaiDate } from "@/domain/time";
import type { ResultFormat, RoundResult } from "@/domain/types";
import { invalidate } from "@/server/cache";
import { afterCommit, json, q, q1, run, tx, type SqlValue } from "@/server/db";
import { audit } from "./audit";
import { settlePending } from "./settlement";
import { getLotto, listLottos, type Lotto } from "./lottos";

export type RoundStatus = "scheduled" | "resulted" | "cancelled";
export type RoundPhase = "upcoming" | "open" | "closed" | "resulted" | "cancelled";

export interface Round {
  id: number;
  lottoId: number;
  roundNo: number | null;
  dayKey: string;
  opensAt: number;
  closesAt: number;
  drawAt: number;
  status: RoundStatus;
  result: RoundResult | null;
  resultedAt: number | null;
  settledAt: number | null;
}

export interface RoundRow {
  id: number;
  lotto_id: number;
  round_no: number | null;
  day_key: string;
  opens_at: number;
  closes_at: number;
  draw_at: number;
  status: RoundStatus;
  result: string | null;
  resulted_at: number | null;
  resulted_by?: number | null;
  settled_at: number | null;
}

export function toRound(r: RoundRow): Round {
  return {
    id: r.id,
    lottoId: r.lotto_id,
    roundNo: r.round_no,
    dayKey: r.day_key,
    opensAt: r.opens_at,
    closesAt: r.closes_at,
    drawAt: r.draw_at,
    status: r.status,
    result: json.parse<RoundResult | null>(r.result, null),
    resultedAt: r.resulted_at,
    settledAt: r.settled_at,
  };
}

export function phaseOf(r: Pick<Round, "opensAt" | "closesAt" | "status">, now: number): RoundPhase {
  if (r.status === "cancelled") return "cancelled";
  if (r.status === "resulted") return "resulted";
  if (now < r.opensAt) return "upcoming";
  if (now < r.closesAt) return "open";
  return "closed";
}

export function roundLabel(r: Pick<Round, "roundNo" | "closesAt">): string {
  return r.roundNo != null ? `รอบที่ ${r.roundNo}` : `งวด ${formatThaiDate(r.closesAt)}`;
}

export async function getRound(id: number): Promise<Round | undefined> {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  const row = await q1<RoundRow>("SELECT * FROM rounds WHERE id = ?", id);
  return row && toRound(row);
}

type Planned = { lotto: Lotto; roundNo: number | null; key: string; opensAt: number; closesAt: number };

function plannedRounds(lottos: Lotto[], now: number, daysBack: number, daysAhead: number): Planned[] {
  const today = dayKey(now);
  const keys = Array.from({ length: daysBack + daysAhead + 1 }, (_, i) => addDays(today, i - daysBack));
  const out: Planned[] = [];
  for (const lotto of lottos) {
    const s = lotto.schedule;
    if (s.kind === "interval") {
      for (const key of keys) {
        const closes = closesForDay(s, key);
        if (closes.length === 0) continue;
        const opensAt = opensOnDay(s, key) ?? previousClose(s, closes[0]) ?? closes[0] - s.everyMin * 60_000;
        closes.forEach((c, i) => out.push({ lotto, roundNo: i + 1, key, opensAt, closesAt: c }));
      }
      continue;
    }
    const closes = keys.flatMap((key) => closesForDay(s, key).map((c) => ({ key, c })));
    // Draws that are weeks away (monthly) still need their round now, so members can bet early.
    if (!closes.some(({ c }) => c > now)) {
      const upcoming = nextClose(s, now);
      if (upcoming !== null) closes.push({ key: dayKey(upcoming), c: upcoming });
    }
    closes.forEach(({ key, c }, i) => {
      const opensAt = opensOnDay(s, key) ?? (i > 0 ? closes[i - 1].c : (previousClose(s, c) ?? c - DAY));
      out.push({ lotto, roundNo: null, key, opensAt, closesAt: c });
    });
  }
  return out;
}

/**
 * Make sure every scheduled round from `daysBack` days ago to `daysAhead` days ahead exists.
 * Weekly/monthly rounds open when the previous draw closes. Interval (Yiki) rounds of a day
 * all open when the previous day's last round closes. Only missing rounds are inserted.
 */
export async function ensureRounds(now: number, { daysBack = 1, daysAhead = 1 } = {}): Promise<number> {
  const lottos = await listLottos();
  const planned = plannedRounds(lottos, now, daysBack, daysAhead);
  if (planned.length === 0) return 0;
  const from = Math.min(...planned.map((p) => p.closesAt));
  const to = Math.max(...planned.map((p) => p.closesAt));
  const existing = await q<{ lotto_id: number; closes_at: number }>("SELECT lotto_id, closes_at FROM rounds WHERE closes_at BETWEEN ? AND ?", from, to);
  const have = new Set(existing.map((r) => `${r.lotto_id}:${r.closes_at}`));
  const missing = planned.filter((p) => !have.has(`${p.lotto.id}:${p.closesAt}`));
  let inserted = 0;
  for (let i = 0; i < missing.length; i += 400) {
    const part = missing.slice(i, i + 400);
    const values: SqlValue[] = part.flatMap((p) => [p.lotto.id, p.roundNo, p.key, p.opensAt, p.closesAt, p.closesAt + p.lotto.resultDelayMin * 60_000]);
    // IGNORE: another instance may insert the same round at the same moment (UNIQUE lotto_id, closes_at).
    inserted += (
      await run(
        `INSERT IGNORE INTO rounds (lotto_id, round_no, day_key, opens_at, closes_at, draw_at) VALUES ${part.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
        ...values,
      )
    ).changes;
  }
  if (inserted > 0) invalidate("lobby");
  return inserted;
}

/**
 * After a lotto's schedule or result delay changed, bring its future rounds in line with the new plan.
 * Only rounds nobody has touched are changed: still scheduled, closing in the future, no bills and no
 * point guesses. Those that match a planned close get their open/draw times (and round number) updated;
 * those the new schedule no longer has are cancelled (admin may not DELETE rounds, and a cancelled
 * round with no bills refunds nothing). Rounds with bills or guesses keep their original times.
 * Missing rounds of the new plan are created by the `ensureRounds` call at the end.
 */
export async function reconcileRounds(lottoId: number, actorId: number | null, now = Date.now()): Promise<{ updated: number; cancelled: number; created: number }> {
  const lotto = await getLotto(lottoId);
  if (!lotto) return { updated: 0, cancelled: 0, created: 0 };
  const plan = new Map(plannedRounds([lotto], now, 1, 1).map((p) => [p.closesAt, p]));
  const untouched = await q<{ id: number; closes_at: number; round_no: number | null; day_key: string; opens_at: number; draw_at: number }>(
    `SELECT r.id, r.closes_at, r.round_no, r.day_key, r.opens_at, r.draw_at FROM rounds r
     WHERE r.lotto_id = ? AND r.status = 'scheduled' AND r.closes_at > ?
       AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.round_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM point_guesses g WHERE g.round_id = r.id)`,
    lottoId,
    now,
  );
  let updated = 0;
  let cancelled = 0;
  for (const r of untouched) {
    const want = plan.get(r.closes_at);
    if (!want) {
      if ((await cancelRound(r.id, actorId, now)).ok) cancelled++;
      continue;
    }
    const drawAt = want.closesAt + lotto.resultDelayMin * 60_000;
    if (want.opensAt === r.opens_at && drawAt === r.draw_at && want.roundNo === r.round_no && want.key === r.day_key) continue;
    // Re-check "no bills" in the UPDATE itself: a bill may have landed since the SELECT.
    const { changes } = await run(
      `UPDATE rounds SET opens_at = ?, draw_at = ?, round_no = ?, day_key = ?
       WHERE id = ? AND status = 'scheduled' AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.round_id = rounds.id)`,
      want.opensAt,
      drawAt,
      want.roundNo,
      want.key,
      r.id,
    );
    updated += changes;
  }
  const created = await ensureRounds(now);
  if (updated > 0 || cancelled > 0) invalidate("lobby", "results");
  return { updated, cancelled, created };
}

export type SetResultOutcome ={ ok: true; result: RoundResult } | { ok: false; error: string };

function invalidateRoundViews(roundId: number) {
  const keys = ["lobby", "results", `limits:${roundId}`];
  invalidate(...keys);
  afterCommit(() => invalidate(...keys));
}

/** Record a result, then pay every bill. Paying runs in chunks and resumes after a crash. */
export async function setResult(roundId: number, input: ResultInput, actorId: number | null, now = Date.now()): Promise<SetResultOutcome> {
  const { t } = await serverI18n();
  const e = t.errors;
  const round = await getRound(roundId);
  if (!round) return { ok: false, error: e.rounds.notFound };
  const lotto = await getLotto(round.lottoId);
  if (!lotto) return { ok: false, error: e.rounds.lottoNotFound };
  const derived = deriveResult(lotto.format, input, e.result);
  if (!derived.ok) return derived;

  const marked = await tx(async (): Promise<SetResultOutcome> => {
    const locked = await q1<RoundRow>("SELECT * FROM rounds WHERE id = ? FOR UPDATE", roundId);
    if (!locked) return { ok: false, error: e.rounds.notFound };
    if (locked.status === "cancelled") return { ok: false, error: e.rounds.cancelled };
    if (locked.status === "resulted") return { ok: false, error: e.rounds.resulted };
    if (now < locked.closes_at) return { ok: false, error: e.rounds.notClosed };
    await run(
      "UPDATE rounds SET status = 'resulted', result = ?, resulted_at = ?, resulted_by = ? WHERE id = ?",
      json.str(derived.result),
      now,
      actorId,
      roundId,
    );
    if (actorId !== null) await audit(actorId, "round.result", `round:${roundId}`, derived.result, now);
    return { ok: true, result: derived.result };
  });
  if (!marked.ok) return marked;
  invalidateRoundViews(roundId);
  await settlePending(roundId, now);
  // Point guesses on this round; if this fails the scheduler retries it.
  await settleGuesses(roundId, now).catch((error) => console.error("[rounds] guess settlement failed:", error instanceof Error ? error.message : error));
  return marked;
}

/** Cancel a round: every pending bill is refunded in full. */
export async function cancelRound(roundId: number, actorId: number | null, now = Date.now()): Promise<{ ok: boolean; error?: string; refunded?: number }> {
  const e = await errorsT();
  const marked = await tx(async () => {
    const locked = await q1<RoundRow>("SELECT * FROM rounds WHERE id = ? FOR UPDATE", roundId);
    if (!locked) return { ok: false as const, error: e.rounds.notFound };
    if (locked.status !== "scheduled") return { ok: false as const, error: e.rounds.done };
    await run("UPDATE rounds SET status = 'cancelled', resulted_at = ?, resulted_by = ? WHERE id = ?", now, actorId, roundId);
    await audit(actorId, "round.cancel", `round:${roundId}`, undefined, now);
    return { ok: true as const };
  });
  if (!marked.ok) return marked;
  invalidateRoundViews(roundId);
  const { bills } = await settlePending(roundId, now);
  // Guesses on a cancelled round get their points back.
  await settleGuesses(roundId, now).catch((error) => console.error("[rounds] guess refund failed:", error instanceof Error ? error.message : error));
  return { ok: true, refunded: bills };
}

const randomDigits = (n: number, rng: () => number) => Array.from({ length: n }, () => Math.floor(rng() * 10)).join("");

const cryptoRng = () => randomInt(0, 1_000_000) / 1_000_000;

/** A fair random draw. Used for the house game (Yiki) and for demo installs. */
export function randomResult(format: ResultFormat, rng: () => number = cryptoRng): ResultInput {
  switch (format) {
    case "standard":
      return { top3: randomDigits(3, rng), bottom2: randomDigits(2, rng) };
    case "laos4":
      return { top4: randomDigits(4, rng) };
    case "thai_gov":
      return {
        first6: randomDigits(6, rng),
        front3: [randomDigits(3, rng), randomDigits(3, rng)],
        back3: [randomDigits(3, rng), randomDigits(3, rng)],
        bottom2: randomDigits(2, rng),
      };
  }
}

/** Draw and settle every auto-result round whose draw time has passed. */
export async function autoResults(now: number, limit = 200): Promise<number> {
  const due = await q<{ id: number; format: ResultFormat }>(
    `SELECT r.id, l.format FROM rounds r JOIN lottos l ON l.id = r.lotto_id
     WHERE r.status = 'scheduled' AND r.draw_at <= ? AND l.auto_result = 1
     ORDER BY r.draw_at LIMIT ?`,
    now,
    limit,
  );
  for (const r of due) await setResult(r.id, randomResult(r.format), null, now);
  return due.length;
}

/** Finish paying or refunding rounds whose settlement was interrupted. */
export async function resumeSettlements(now: number): Promise<number> {
  const open = await q<{ id: number }>("SELECT id FROM rounds WHERE status IN ('resulted','cancelled') AND settled_at IS NULL ORDER BY resulted_at LIMIT 20");
  for (const r of open) await settlePending(r.id, now);
  return open.length;
}

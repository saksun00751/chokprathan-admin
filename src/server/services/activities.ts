import "server-only";
import { randomInt } from "node:crypto";
import { CHANCE_TOTAL, affordableSlot, guessPayout, isGuessNumber, pickPrize } from "@/domain/activities";
import type { RoundResult } from "chokprathan-core/rules/types";
import { dayKey, dayStartMs } from "chokprathan-core/rules/time";
import { json, q, q1, run, tolerateMissingTable, tx } from "@/server/db";
import { isBlocked, memberIdentity } from "./blocklist";
import { movePoints } from "./points";
import { getSetting } from "./settings";
import { move } from "./wallet";

/**
 * Point activities (rules in src/domain/activities.ts): the lucky wheel and guessing a round's
 * bottom two digits. The server draws every result; the screen only shows it. Points are taken and
 * credit paid in one transaction, under a lock on the member's point balance, so limits hold even
 * when a member taps twice. Until migration 7 is applied both report "not ready".
 */

export type PlayError = "off" | "points" | "limit" | "budget" | "round" | "number" | "taken" | "max" | "blocked" | "notReady";

class Refusal extends Error {
  constructor(readonly code: PlayError) {
    super(code);
  }
}

const NOT_MIGRATED = new Set([1146, 1054]);
const notMigrated = (error: unknown) => NOT_MIGRATED.has((error as { errno?: number }).errno ?? 0);

/** Lock the member's point balance for this transaction and read it (0 when they never had points). */
async function lockPoints(userId: number): Promise<number> {
  const row = await q1<{ points: number }>("SELECT points FROM member_points WHERE user_id = ? FOR UPDATE", userId);
  return Number(row?.points ?? 0);
}

/** Credit won: into the main wallet as a "game" transaction, with its turnover requirement. */
async function payCredit(userId: number, amount: number, turnoverX: number, ref: string, note: string, now: number) {
  if (amount <= 0) return;
  await move(userId, "balance", amount, "game", { ref, note, now });
  if (turnoverX > 0) await run("UPDATE users SET turnover_required = turnover_required + ? WHERE id = ?", amount * turnoverX, userId);
}

async function refuseBlocked(userId: number) {
  const who = await memberIdentity(userId);
  if (!who) throw new Refusal("blocked");
  if (await isBlocked(who)) throw new Refusal("blocked");
}

/* ---------- lucky wheel ---------- */

export type SpinResult = { ok: true; slot: number; prize: number; points: number; spinsLeft: number | null } | { ok: false; error: PlayError };

export async function spinWheel(userId: number, now = Date.now()): Promise<SpinResult> {
  const { wheel } = await getSetting("activities");
  if (!wheel.enabled) return { ok: false, error: "off" };
  try {
    await refuseBlocked(userId);
    const today = dayStartMs(dayKey(now));
    let remaining: number | null = null;
    if (wheel.dailyBudget > 0) {
      const paid = await q1<{ s: number | null }>("SELECT SUM(prize) AS s FROM wheel_spins WHERE created_at >= ?", today);
      remaining = wheel.dailyBudget - Number(paid?.s ?? 0);
      if (remaining <= 0) return { ok: false, error: "budget" };
    }
    const slot = affordableSlot(wheel.prizes, pickPrize(wheel.prizes, randomInt(0, CHANCE_TOTAL)), remaining);
    const prize = wheel.prizes[slot].amount;
    return await tx(async () => {
      if ((await lockPoints(userId)) < wheel.cost) throw new Refusal("points");
      let spinsLeft: number | null = null;
      if (wheel.dailyLimit > 0) {
        const done = Number((await q1<{ n: number }>("SELECT COUNT(*) AS n FROM wheel_spins WHERE user_id = ? AND created_at >= ?", userId, today))?.n ?? 0);
        if (done >= wheel.dailyLimit) throw new Refusal("limit");
        spinsLeft = wheel.dailyLimit - done - 1;
      }
      const id = (await run("INSERT INTO wheel_spins (user_id, cost, slot, prize, created_at) VALUES (?, ?, ?, ?, ?)", userId, wheel.cost, slot, prize, now))
        .lastId;
      const ref = `WH${String(id).padStart(6, "0")}`;
      const points = await movePoints(userId, -wheel.cost, "wheel", { ref, now });
      await payCredit(userId, prize, wheel.turnoverX, ref, "วงล้อนำโชค", now);
      return { ok: true as const, slot, prize, points, spinsLeft };
    });
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.code };
    if (notMigrated(error)) return { ok: false, error: "notReady" };
    throw error;
  }
}

/* ---------- guess the bottom two digits ---------- */

export type GuessResult = { ok: true; points: number } | { ok: false; error: PlayError };

export async function placeGuess(userId: number, roundId: number, number: string, now = Date.now()): Promise<GuessResult> {
  const { guess } = await getSetting("activities");
  if (!guess.enabled) return { ok: false, error: "off" };
  if (!isGuessNumber(number)) return { ok: false, error: "number" };
  try {
    await refuseBlocked(userId);
    const round = await q1<{ lotto_id: number; status: string; opens_at: number; closes_at: number }>(
      "SELECT lotto_id, status, opens_at, closes_at FROM rounds WHERE id = ?",
      roundId,
    );
    // Only rounds of the chosen lotteries that are open for bets right now.
    if (!round || !guess.lottoIds.includes(round.lotto_id) || round.status !== "scheduled" || now < round.opens_at || now >= round.closes_at) {
      return { ok: false, error: "round" };
    }
    return await tx(async () => {
      if ((await lockPoints(userId)) < guess.cost) throw new Refusal("points");
      const mine = Number((await q1<{ n: number }>("SELECT COUNT(*) AS n FROM point_guesses WHERE round_id = ? AND user_id = ?", roundId, userId))?.n ?? 0);
      if (mine >= guess.maxPerRound) throw new Refusal("max");
      let id: number;
      try {
        id = (
          await run(
            "INSERT INTO point_guesses (user_id, round_id, number, cost, promised, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            userId,
            roundId,
            number,
            guess.cost,
            guess.prize,
            now,
          )
        ).lastId;
      } catch (error) {
        if ((error as { errno?: number }).errno === 1062) throw new Refusal("taken");
        throw error;
      }
      const points = await movePoints(userId, -guess.cost, "guess", { ref: `GS${String(id).padStart(6, "0")}`, now });
      return { ok: true as const, points };
    });
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.code };
    if (notMigrated(error)) return { ok: false, error: "notReady" };
    throw error;
  }
}

/**
 * Settle a round's guesses: winners (bottom two digits match) are paid, the rest lose; a cancelled
 * round refunds every guess's points. Safe to repeat. Returns how many guesses it settled.
 */
export async function settleGuesses(roundId: number, now = Date.now()): Promise<number> {
  return tolerateMissingTable(async () => {
    const round = await q1<{ status: string; result: string | null }>("SELECT status, result FROM rounds WHERE id = ?", roundId);
    if (!round || (round.status !== "resulted" && round.status !== "cancelled")) return 0;
    const { guess } = await getSetting("activities");
    return tx(async () => {
      const pending = await q<{ id: number; user_id: number; number: string; cost: number; promised: number }>(
        "SELECT id, user_id, number, cost, promised FROM point_guesses WHERE round_id = ? AND status = 'pending' ORDER BY id FOR UPDATE",
        roundId,
      );
      if (pending.length === 0) return 0;
      const ref = (id: number) => `GS${String(id).padStart(6, "0")}`;
      if (round.status === "cancelled") {
        for (const g of pending) {
          await movePoints(g.user_id, g.cost, "guess_refund", { ref: ref(g.id), now });
          await run("UPDATE point_guesses SET status = 'refunded', settled_at = ? WHERE id = ?", now, g.id);
        }
        return pending.length;
      }
      const bottom2 = json.parse<RoundResult | null>(round.result, null)?.bottom2;
      const winners = pending.filter((g) => g.number === bottom2);
      for (const g of winners) {
        const paid = Math.min(Number(g.promised), guessPayout(Number(g.promised), winners.length, guess.roundBudget));
        await payCredit(g.user_id, paid, guess.turnoverX, ref(g.id), "ทายเลข 2 ตัวล่าง", now);
        await run("UPDATE point_guesses SET status = 'won', paid = ?, settled_at = ? WHERE id = ?", paid, now, g.id);
      }
      await run("UPDATE point_guesses SET status = 'lost', settled_at = ? WHERE round_id = ? AND status = 'pending'", now, roundId);
      return pending.length;
    });
  }, 0);
}

/** For the scheduler: settle guesses left pending on rounds that already have a result or were cancelled. */
export async function settlePendingGuesses(now = Date.now()): Promise<number> {
  const rounds = await tolerateMissingTable(
    () =>
      q<{ round_id: number }>(
        `SELECT DISTINCT g.round_id FROM point_guesses g JOIN rounds r ON r.id = g.round_id
         WHERE g.status = 'pending' AND r.status IN ('resulted','cancelled') LIMIT 20`,
      ),
    [],
  );
  let n = 0;
  for (const r of rounds) n += await settleGuesses(r.round_id, now);
  return n;
}

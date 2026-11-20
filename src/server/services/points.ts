import "server-only";
import { pointsFor } from "@/domain/points";
import { q, q1, run, tx } from "@/server/db";
import { getSetting } from "./settings";

/**
 * Loyalty points (rules in src/domain/points.ts). A balance per member plus a ledger of every move,
 * like the money wallets. Points come from approved deposits and staff credit top-ups, and staff
 * with `members.points` add or deduct them by hand.
 */

export type PointKind = "deposit" | "topup" | "adjust" | "wheel" | "guess" | "guess_refund";

export class InsufficientPointsError extends Error {
  constructor() {
    super("insufficient points");
  }
}

/** Tables added by migration 5. Until a server restarts onto it, points are simply not counted. */
const NOT_MIGRATED = new Set([1146, 1054]);
export const pointsNotMigrated = (error: unknown) => NOT_MIGRATED.has((error as { errno?: number }).errno ?? 0);

/** Add (or with a negative amount, take) points; never below zero. Joins the caller's transaction. Returns the new balance. */
export async function movePoints(
  userId: number,
  amount: number,
  kind: PointKind,
  { ref, note, actorId = null, now = Date.now() }: { ref?: string; note?: string; actorId?: number | null; now?: number } = {},
): Promise<number> {
  if (!Number.isInteger(amount) || amount === 0) throw new RangeError("points must be a non-zero integer");
  return tx(async () => {
    await run("INSERT INTO member_points (user_id, points, updated_at) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE user_id = user_id", userId, now);
    const changed = await run(
      "UPDATE member_points SET points = points + ?, updated_at = ? WHERE user_id = ? AND points + ? >= 0",
      amount,
      now,
      userId,
      amount,
    );
    if (changed.changes === 0) throw new InsufficientPointsError();
    const row = await q1<{ points: number }>("SELECT points FROM member_points WHERE user_id = ?", userId);
    await run(
      "INSERT INTO point_moves (user_id, amount, balance_after, kind, ref, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      userId,
      amount,
      row!.points,
      kind,
      ref?.slice(0, 40) ?? null,
      note?.slice(0, 255) ?? null,
      actorId,
      now,
    );
    return Number(row!.points);
  });
}

/**
 * Points for money that just came in (`amount` in satang) under the current rule, inside the
 * caller's transaction. Returns how many were given: 0 when the system is off, the amount is below
 * one step, or the server has not migrated yet. That last case never blocks the deposit itself.
 */
export async function awardPoints(
  userId: number,
  amount: number,
  kind: "deposit" | "topup",
  opts: { ref?: string; note?: string; actorId?: number | null; now?: number } = {},
): Promise<number> {
  const earned = pointsFor(amount, await getSetting("points"));
  if (earned <= 0) return 0;
  try {
    await movePoints(userId, earned, kind, opts);
    return earned;
  } catch (error) {
    if (pointsNotMigrated(error)) return 0;
    throw error;
  }
}

export interface PointMove {
  id: number;
  amount: number;
  balance_after: number;
  kind: string;
  ref: string | null;
  note: string | null;
  created_at: number;
  staff: string | null;
}

/** A member's balance and latest moves (with the staff member behind each); empty before migration 5. */
export async function pointsOf(userId: number, limit = 50): Promise<{ points: number; moves: PointMove[] }> {
  try {
    const [row, moves] = await Promise.all([
      q1<{ points: number }>("SELECT points FROM member_points WHERE user_id = ?", userId),
      q<PointMove>(
        `SELECT m.id, m.amount, m.balance_after, m.kind, m.ref, m.note, m.created_at, COALESCE(s.username, s.name) AS staff
         FROM point_moves m LEFT JOIN users s ON s.id = m.actor_id
         WHERE m.user_id = ? ORDER BY m.id DESC LIMIT ?`,
        userId,
        limit,
      ),
    ]);
    return { points: Number(row?.points ?? 0), moves };
  } catch (error) {
    if (pointsNotMigrated(error)) return { points: 0, moves: [] };
    throw error;
  }
}

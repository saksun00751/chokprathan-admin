import "server-only";
import { q, q1, run, tx } from "@/server/db";
import { audit } from "./audit";

export interface MemberDebt {
  id: number;
  roundId: number | null;
  /** satang */
  amount: number;
  outstanding: number;
  writtenOff: number;
  reason: string | null;
  createdAt: number;
}

/** What a member owes or owed, newest first. */
export async function listDebts(userId: number): Promise<MemberDebt[]> {
  const rows = await q<{ id: number; round_id: number | null; amount: number; outstanding: number; written_off: number; reason: string | null; created_at: number }>(
    "SELECT id, round_id, amount, outstanding, written_off, reason, created_at FROM member_debts WHERE user_id = ? ORDER BY id DESC LIMIT 50",
    userId,
  );
  return rows.map((r) => ({
    id: r.id,
    roundId: r.round_id,
    amount: r.amount,
    outstanding: r.outstanding,
    writtenOff: r.written_off,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

export type WriteOffOutcome = { ok: true; amount: number } | { ok: false; error: "notFound" | "nothing" | "reason" };

/** Forgive what is still owed on one debt. No money moves; the debt records who forgave it and why. */
export async function writeOffDebt(debtId: number, actorId: number, reason: string, now = Date.now(), ip: string | null = null): Promise<WriteOffOutcome> {
  const why = reason.trim().slice(0, 255);
  if (why.length < 3) return { ok: false, error: "reason" };
  return tx(async (): Promise<WriteOffOutcome> => {
    const found = await q1<{ user_id: number }>("SELECT user_id FROM member_debts WHERE id = ?", debtId);
    if (!found) return { ok: false, error: "notFound" };
    // The member before the debt: the order collection locks them in.
    await q1("SELECT id FROM users WHERE id = ? FOR UPDATE", found.user_id);
    const debt = (await q1<{ outstanding: number }>("SELECT outstanding FROM member_debts WHERE id = ? FOR UPDATE", debtId))!;
    if (debt.outstanding <= 0) return { ok: false, error: "nothing" };
    await run(
      "UPDATE member_debts SET outstanding = 0, written_off = written_off + ?, written_off_by = ?, written_off_at = ?, reason = ? WHERE id = ?",
      debt.outstanding,
      actorId,
      now,
      why,
      debtId,
    );
    await audit(actorId, "debt.writeoff", `user:${found.user_id}`, { debtId, amount: debt.outstanding, reason: why }, now, ip);
    return { ok: true, amount: debt.outstanding };
  });
}

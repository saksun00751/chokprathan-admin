export interface Db {
  q<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  q1<T>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  run(sql: string, ...params: unknown[]): Promise<{ changes: number; lastId: number }>;
}

export type WalletKind = "balance" | "cashback" | "affiliate";
const COLUMN: Record<WalletKind, string> = { balance: "balance", cashback: "cashback_balance", affiliate: "affiliate_balance" };

/** Satang the member still owes. */
export async function outstandingDebt(db: Db, userId: number): Promise<number> {
  const row = await db.q1<{ n: number | string | null }>("SELECT SUM(outstanding) AS n FROM member_debts WHERE user_id = ? AND outstanding > 0", userId);
  return Number(row?.n ?? 0);
}

/**
 * Repay what the member owes out of money that just came into one wallet, oldest debt first. Never
 * more than `credited`: what the member already held stays theirs. Call inside a transaction right
 * after the credit. Returns the satang taken.
 */
export async function collectDebt(db: Db, userId: number, wallet: WalletKind, credited: number, now: number): Promise<number> {
  // Most members owe nothing: do not lock anything for them.
  if ((await outstandingDebt(db, userId)) === 0) return 0;
  const column = COLUMN[wallet];
  const user = (await db.q1<{ v: number }>(`SELECT ${column} AS v FROM users WHERE id = ? FOR UPDATE`, userId))!;
  const debts = await db.q<{ id: number; outstanding: number }>(
    "SELECT id, outstanding FROM member_debts WHERE user_id = ? AND outstanding > 0 ORDER BY id FOR UPDATE",
    userId,
  );
  let held = Number(user.v);
  let left = Math.min(held, credited);
  let taken = 0;
  for (const debt of debts) {
    const part = Math.min(left, Number(debt.outstanding));
    if (part <= 0) break;
    left -= part;
    held -= part;
    taken += part;
    await db.run("UPDATE member_debts SET outstanding = outstanding - ? WHERE id = ?", part, debt.id);
    await db.run(`UPDATE users SET ${column} = ${column} - ? WHERE id = ?`, part, userId);
    await db.run(
      "INSERT INTO transactions (user_id, wallet, type, amount, balance_after, ref, note, created_at) VALUES (?, ?, 'debt_repay', ?, ?, ?, ?, ?)",
      userId,
      wallet,
      -part,
      held,
      `DEBT${debt.id}`,
      "หักชำระยอดค้าง",
      now,
    );
  }
  return taken;
}

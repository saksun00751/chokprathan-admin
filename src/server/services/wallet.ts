import "server-only";
import { collectDebt } from "@/core/wallet/debt";
import { q, q1, run, tx } from "@/server/db";

export type WalletKind = "balance" | "cashback" | "affiliate";

export type TxType =
  | "deposit"
  | "bonus"
  | "withdraw"
  | "withdraw_refund"
  /** taken from money coming in to repay a debt (written by core/wallet/debt) */
  | "debt_repay"
  /** differences paid or taken back when a result is corrected */
  | "win_correction"
  | "cashback_correction"
  | "aff_correction"
  | "bet"
  | "win"
  | "refund"
  | "cashback_earn"
  | "cashback_claim"
  | "aff_earn"
  | "aff_transfer"
  | "voucher"
  | "adjust"
  /** credit won with points (lucky wheel, guess the number) */
  | "game";

export const WALLET_COLUMN: Record<WalletKind, string> = {
  balance: "balance",
  cashback: "cashback_balance",
  affiliate: "affiliate_balance",
};

export class InsufficientFundsError extends Error {
  constructor() {
    super("ยอดเงินไม่พอ");
  }
}

/**
 * Move money in or out of one wallet and write the ledger row.
 * amount is signed satang. Throws InsufficientFundsError instead of going negative.
 * The row lock taken by the UPDATE is held to the end of the surrounding transaction,
 * so the balance read back is exactly this movement's result.
 */
export async function move(
  userId: number,
  wallet: WalletKind,
  amount: number,
  type: TxType,
  { ref, note, now = Date.now(), actorId = null }: { ref?: string; note?: string; now?: number; actorId?: number | null } = {},
): Promise<number> {
  if (!Number.isInteger(amount) || amount === 0) throw new RangeError("amount must be a non-zero integer");
  const col = WALLET_COLUMN[wallet];
  return tx(async () => {
    const changed = await run(`UPDATE users SET ${col} = ${col} + ? WHERE id = ? AND ${col} + ? >= 0`, amount, userId, amount);
    if (changed.changes === 0) throw new InsufficientFundsError();
    const row = await q1<{ v: number }>(`SELECT ${col} AS v FROM users WHERE id = ?`, userId);
    await run(
      `INSERT INTO transactions (user_id, wallet, type, amount, balance_after, ref, note, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      wallet,
      type,
      amount,
      row!.v,
      ref?.slice(0, 40) ?? null,
      note?.slice(0, 255) ?? null,
      actorId,
      now,
    );
    // Whatever the member owes comes out of new money first.
    if (amount > 0) return row!.v - (await collectDebt({ q, q1, run }, userId, wallet, amount, now));
    return row!.v;
  });
}

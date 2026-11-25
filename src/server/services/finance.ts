import "server-only";
import { outstandingDebt } from "chokprathan-core/wallet/debt";
import { fmt } from "@/i18n/format";
import { errorsT } from "@/i18n/server";
import { formatBaht } from "chokprathan-core/rules/money";
import { json, q, q1, run, tx } from "@/server/db";
import { audit } from "./audit";
import { bankMove, payoutAccounts } from "./banks";
import { move } from "./wallet";
import { awardPoints } from "./points";

export interface ReceivingAccount {
  bank: string;
  account: string;
  name: string;
}

export interface DepositRow {
  id: number;
  user_id: number;
  amount: number;
  /** the website account the member was told to transfer to (bank_accounts.id) */
  bank_account_id: number | null;
  bonus: number;
  promotion_id: number | null;
  status: "awaiting" | "pending" | "approved" | "rejected" | "expired";
  to_bank: string | null;
  slip: string | null;
  note: string | null;
  created_at: number;
  expires_at: number;
  confirmed_at: number | null;
  reviewed_at: number | null;
  reviewed_by: number | null;
}

export interface Deposit {
  id: number;
  amount: number;
  bonus: number;
  promotionId: number | null;
  status: DepositRow["status"];
  toBank: ReceivingAccount | null;
  createdAt: number;
  expiresAt: number;
  hasSlip: boolean;
  note: string | null;
}

export const toDeposit = (r: DepositRow): Deposit => ({
  id: r.id,
  amount: r.amount,
  bonus: r.bonus,
  promotionId: r.promotion_id,
  status: r.status,
  toBank: json.parse<ReceivingAccount | null>(r.to_bank, null),
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  hasSlip: !!r.slip,
  note: r.note,
});

type Fail = { ok: false; error: string };

interface PromotionRow {
  id: number;
  title: string;
  bonus_percent: number;
  max_bonus: number;
  min_deposit: number;
  turnover_x: number;
  once_per_user: number;
  active: number;
}

async function promotionProblem(userId: number, promotionId: number, amount: number): Promise<string | null> {
  const e = await errorsT();
  const p = await q1<PromotionRow>("SELECT * FROM promotions WHERE id = ?", promotionId);
  if (!p || !p.active) return e.wallet.promoClosed;
  if (p.bonus_percent <= 0) return e.wallet.promoNoBonus;
  if (amount < p.min_deposit) return fmt(e.wallet.promoMin, { amount: formatBaht(p.min_deposit, { decimals: "auto" }) });
  if (p.once_per_user && (await q1("SELECT 1 FROM promotion_claims WHERE user_id = ? AND promotion_id = ?", userId, promotionId))) {
    return e.wallet.promoUsed;
  }
  return null;
}

export async function approveDeposit(depositId: number, actorId: number | null, now = Date.now(), ip: string | null = null): Promise<{ ok: true } | Fail> {
  const e = await errorsT();
  return tx(async () => {
    const d = await q1<DepositRow>("SELECT * FROM deposits WHERE id = ? FOR UPDATE", depositId);
    if (!d) return { ok: false as const, error: e.wallet.depositNotFound };
    if (d.status !== "pending" && d.status !== "awaiting") return { ok: false as const, error: e.wallet.alreadyProcessed };
    const ref = `DP${String(d.id).padStart(6, "0")}`;
    await move(d.user_id, "balance", d.amount, "deposit", { ref, note: "ฝากเงิน", now, actorId });
    // Loyalty points for the deposit itself (never for the promotion bonus below).
    await awardPoints(d.user_id, d.amount, "deposit", { ref, actorId, now });
    // The money arrived in the website account the member was given: its recorded balance follows.
    if (d.bank_account_id) await bankMove(Number(d.bank_account_id), d.amount, "deposit", ref, null, actorId, now);

    let bonus = 0;
    if (d.promotion_id !== null && !(await promotionProblem(d.user_id, d.promotion_id, d.amount))) {
      const p = (await q1<PromotionRow>("SELECT * FROM promotions WHERE id = ?", d.promotion_id))!;
      bonus = Math.floor((d.amount * p.bonus_percent) / 100);
      if (p.max_bonus > 0) bonus = Math.min(bonus, p.max_bonus);
      if (bonus > 0) {
        await move(d.user_id, "balance", bonus, "bonus", { ref, note: p.title, now, actorId });
        await run("UPDATE users SET turnover_required = turnover_required + ? WHERE id = ?", (d.amount + bonus) * p.turnover_x, d.user_id);
        await run(
          "INSERT INTO promotion_claims (promotion_id, user_id, deposit_id, bonus, created_at) VALUES (?, ?, ?, ?, ?)",
          p.id,
          d.user_id,
          d.id,
          bonus,
          now,
        );
      }
    }
    await run("UPDATE users SET first_deposit_at = ? WHERE id = ? AND first_deposit_at IS NULL", now, d.user_id);
    await run("UPDATE deposits SET status = 'approved', bonus = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?", bonus, now, actorId, depositId);
    if (actorId !== null) await audit(actorId, "deposit.approve", `deposit:${depositId}`, { amount: d.amount, bonus, bankAccount: d.bank_account_id }, now, ip);
    return { ok: true as const };
  });
}

export async function rejectDeposit(
  depositId: number,
  actorId: number,
  note: string,
  now = Date.now(),
  ip: string | null = null,
): Promise<{ ok: true } | Fail> {
  const e = await errorsT();
  return tx(async () => {
    const changed = (
      await run(
        "UPDATE deposits SET status = 'rejected', note = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status IN ('awaiting','pending')",
        note.slice(0, 255) || null,
        now,
        actorId,
        depositId,
      )
    ).changes;
    if (!changed) return { ok: false as const, error: e.wallet.alreadyProcessed };
    await audit(actorId, "deposit.reject", `deposit:${depositId}`, { note }, now, ip);
    return { ok: true as const };
  });
}

export async function expireDeposits(now = Date.now()) {
  return (await run("UPDATE deposits SET status = 'expired' WHERE status = 'awaiting' AND expires_at < ?", now)).changes;
}

export interface WithdrawalRow {
  id: number;
  user_id: number;
  amount: number;
  /** the website account staff paid it from (bank_accounts.id) */
  paid_from_id: number | null;
  bank_code: string;
  bank_account: string;
  bank_name: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: number;
  reviewed_at: number | null;
  reviewed_by: number | null;
}

/**
 * Mark a withdrawal as paid. When the website has withdraw accounts, staff must say which one the
 * money left from, and its recorded balance goes down by the amount.
 */
export async function approveWithdrawal(
  id: number,
  actorId: number,
  now = Date.now(),
  ip: string | null = null,
  paidFromId: number | null = null,
): Promise<{ ok: true } | Fail> {
  const e = await errorsT();
  const accounts = await payoutAccounts();
  if (accounts.length > 0 && paidFromId === null) return { ok: false, error: e.admin.payFromRequired };
  if (paidFromId !== null && !accounts.some((a) => a.id === paidFromId)) return { ok: false, error: e.admin.payFromInvalid };
  return tx(async () => {
    const w = await q1<WithdrawalRow>("SELECT * FROM withdrawals WHERE id = ? FOR UPDATE", id);
    if (!w || w.status !== "pending") return { ok: false as const, error: e.wallet.alreadyProcessed };
    // The member's row lock keeps a debt from appearing between this check and the approval.
    await q1("SELECT id FROM users WHERE id = ? FOR UPDATE", w.user_id);
    const correcting = await q1(
      `SELECT s.id FROM settlement_runs s JOIN bills b ON b.round_id = s.round_id
       WHERE s.kind IN ('correction','void') AND s.status <> 'done' AND (b.user_id = ? OR b.aff1_user = ? OR b.aff2_user = ?) LIMIT 1`,
      w.user_id,
      w.user_id,
      w.user_id,
    );
    if (correcting) return { ok: false as const, error: e.wallet.correctionRunning };
    const owed = await outstandingDebt({ q, q1, run }, w.user_id);
    if (owed > 0) return { ok: false as const, error: fmt(e.wallet.debtBlocks, { amount: formatBaht(owed) }) };
    await run("UPDATE withdrawals SET status = 'approved', reviewed_at = ?, reviewed_by = ?, paid_from_id = ? WHERE id = ?", now, actorId, paidFromId, id);
    if (paidFromId !== null) await bankMove(paidFromId, -w.amount, "withdrawal", `WD${String(id).padStart(6, "0")}`, null, actorId, now);
    await audit(actorId, "withdraw.approve", `withdrawal:${id}`, { amount: w.amount, paidFrom: paidFromId }, now, ip);
    return { ok: true as const };
  });
}

export async function rejectWithdrawal(id: number, actorId: number, note: string, now = Date.now(), ip: string | null = null): Promise<{ ok: true } | Fail> {
  const e = await errorsT();
  return tx(async () => {
    const w = await q1<WithdrawalRow>("SELECT * FROM withdrawals WHERE id = ? FOR UPDATE", id);
    if (!w || w.status !== "pending") return { ok: false as const, error: e.wallet.alreadyProcessed };
    await run(
      "UPDATE withdrawals SET status = 'rejected', note = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?",
      note.slice(0, 255) || null,
      now,
      actorId,
      id,
    );
    await move(w.user_id, "balance", w.amount, "withdraw_refund", {
      ref: `WD${String(id).padStart(6, "0")}`,
      note: note ? `คืนเงินถอน: ${note}` : "คืนเงินถอน",
      now,
      actorId,
    });
    await audit(actorId, "withdraw.reject", `withdrawal:${id}`, { note }, now, ip);
    return { ok: true as const };
  });
}

export async function pendingCounts() {
  const r = await q1<{ d: number; w: number }>(
    "SELECT (SELECT COUNT(*) FROM deposits WHERE status = 'pending') AS d, (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') AS w",
  );
  return { deposits: r?.d ?? 0, withdrawals: r?.w ?? 0 };
}

export async function depositsForUser(userId: number, limit = 20) {
  return (await q<DepositRow>("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userId, limit)).map(toDeposit);
}

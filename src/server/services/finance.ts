import "server-only";
import { fmt } from "@/i18n/format";
import { errorsT } from "@/i18n/server";
import { randomInt } from "node:crypto";
import { formatBaht } from "@/domain/money";
import { dayKey, dayStartMs } from "@/domain/time";
import { json, q, q1, run, tx } from "@/server/db";
import { audit } from "./audit";
import { bankMove, payoutAccounts, receivingAccount } from "./banks";
import { getSettings } from "./settings";
import { InsufficientFundsError, move } from "./wallet";
import { awardPoints } from "./points";
import { isBlocked } from "./blocklist";

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

/** Start a deposit. The member transfers `amount` (with a unique satang tail) to the receiving account. */
export async function createDeposit(
  userId: number,
  baseAmount: number,
  promotionId: number | null,
  now = Date.now(),
): Promise<{ ok: true; deposit: Deposit } | Fail> {
  const { wallet: w } = await getSettings();
  const e = await errorsT();
  if (!Number.isInteger(baseAmount) || baseAmount % 100 !== 0) return { ok: false, error: e.wallet.wholeBaht };
  if (baseAmount < w.depositMin) return { ok: false, error: fmt(e.wallet.depositMin, { amount: formatBaht(w.depositMin, { decimals: "auto" }) }) };
  if (baseAmount > w.depositMax) return { ok: false, error: fmt(e.wallet.depositMax, { amount: formatBaht(w.depositMax, { decimals: "auto" }) }) };
  if (promotionId !== null) {
    const problem = await promotionProblem(userId, promotionId, baseAmount);
    if (problem) return { ok: false, error: problem };
  }
  const bank = await receivingAccount();
  if (!bank) return { ok: false, error: e.wallet.noReceivingAccount };
  const account = { bank: bank.bankCode, account: bank.accountNo, name: bank.accountName };

  return tx(async () => {
    await run("UPDATE deposits SET status = 'expired', note = 'สร้างรายการใหม่แทน' WHERE user_id = ? AND status = 'awaiting'", userId);
    let amount = baseAmount + randomInt(1, 100);
    for (let tries = 0; tries < 50; tries++) {
      if (!(await q1("SELECT 1 FROM deposits WHERE amount = ? AND status IN ('awaiting','pending')", amount))) break;
      amount = baseAmount + randomInt(1, 100);
    }
    const id = (
      await run(
        `INSERT INTO deposits (user_id, amount, promotion_id, status, to_bank, bank_account_id, created_at, expires_at)
         VALUES (?, ?, ?, 'awaiting', ?, ?, ?, ?)`,
        userId,
        amount,
        promotionId,
        json.str(account),
        bank.id,
        now,
        now + w.depositWindowMin * 60_000,
      )
    ).lastId;
    const row = (await q1<DepositRow>("SELECT * FROM deposits WHERE id = ?", id))!;
    return { ok: true as const, deposit: toDeposit(row) };
  });
}

/** Attach (or replace) the transfer slip of a deposit that is not reviewed yet. */
export async function attachSlip(userId: number, depositId: number, slipName: string): Promise<{ ok: true; previous: string | null } | Fail> {
  const e = await errorsT();
  return tx(async () => {
    const d = await q1<DepositRow>("SELECT * FROM deposits WHERE id = ? AND user_id = ? FOR UPDATE", depositId, userId);
    if (!d) return { ok: false as const, error: e.wallet.depositNotFound };
    if (d.status !== "awaiting" && d.status !== "pending") return { ok: false as const, error: e.wallet.alreadyProcessed };
    await run("UPDATE deposits SET slip = ? WHERE id = ?", slipName, depositId);
    return { ok: true as const, previous: d.slip };
  });
}

/** Member says the transfer is done. With auto-approve on (demo only), it is credited immediately. */
export async function confirmDeposit(userId: number, depositId: number, now = Date.now()): Promise<{ ok: true; approved: boolean } | Fail> {
  const { wallet } = await getSettings();
  const e = await errorsT();
  const outcome = await tx(async (): Promise<{ ok: true } | Fail> => {
    const d = await q1<DepositRow>("SELECT * FROM deposits WHERE id = ? AND user_id = ? FOR UPDATE", depositId, userId);
    if (!d) return { ok: false, error: e.wallet.depositNotFound };
    if (d.status !== "awaiting") return { ok: false, error: e.wallet.alreadyProcessed };
    if (now > d.expires_at) {
      await run("UPDATE deposits SET status = 'expired' WHERE id = ?", depositId);
      return { ok: false, error: e.wallet.depositExpired };
    }
    if (wallet.slipRequired && !wallet.depositAutoApprove && !d.slip) return { ok: false, error: e.wallet.slipFirst };
    await run("UPDATE deposits SET status = 'pending', confirmed_at = ? WHERE id = ?", now, depositId);
    return { ok: true };
  });
  if (!outcome.ok) return outcome;
  if (wallet.depositAutoApprove) {
    const r = await approveDeposit(depositId, null, now);
    return r.ok ? { ok: true, approved: true } : r;
  }
  return { ok: true, approved: false };
}

export async function cancelDeposit(userId: number, depositId: number) {
  return (
    (await run("UPDATE deposits SET status = 'expired', note = 'ยกเลิกโดยสมาชิก' WHERE id = ? AND user_id = ? AND status = 'awaiting'", depositId, userId))
      .changes > 0
  );
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

/** Request a withdrawal to the member's bank account. The money is held until review. */
export async function requestWithdrawal(userId: number, amount: number, now = Date.now()): Promise<{ ok: true; id: number } | Fail> {
  const { wallet: w } = await getSettings();
  const e = await errorsT();
  if (!Number.isInteger(amount) || amount % 100 !== 0) return { ok: false, error: e.wallet.wholeBaht };
  if (amount < w.withdrawMin) return { ok: false, error: fmt(e.wallet.withdrawMin, { amount: formatBaht(w.withdrawMin, { decimals: "auto" }) }) };
  if (amount > w.withdrawMax) return { ok: false, error: fmt(e.wallet.withdrawMax, { amount: formatBaht(w.withdrawMax, { decimals: "auto" }) }) };

  try {
    return await tx(async (): Promise<{ ok: true; id: number } | Fail> => {
      // The wallet row lock serialises a member's withdrawals, so the daily count cannot be raced.
      const user = await q1<{
        status: string;
        role: string;
        balance: number;
        turnover_required: number;
        bank_code: string | null;
        bank_account: string | null;
        bank_name: string | null;
        phone: string | null;
        name: string;
      }>("SELECT status, role, balance, turnover_required, bank_code, bank_account, bank_name, phone, name FROM users WHERE id = ? FOR UPDATE", userId);
      if (!user || user.status !== "active" || user.role !== "member") return { ok: false, error: e.wallet.accountUnusable };
      if (!user.bank_code || !user.bank_account || !user.bank_name) return { ok: false, error: e.wallet.addBankFirst };
      // A blocked account, phone, or name never gets money out.
      if (await isBlocked({ phone: user.phone, bankCode: user.bank_code, bankAccount: user.bank_account, name: user.name, bankName: user.bank_name })) {
        return { ok: false, error: e.wallet.blocked };
      }
      if (user.turnover_required > 0) {
        return { ok: false, error: fmt(e.wallet.turnoverLeft, { amount: formatBaht(user.turnover_required) }) };
      }
      const today = (await q1<{ n: number }>(
        "SELECT COUNT(*) AS n FROM withdrawals WHERE user_id = ? AND created_at >= ? AND status != 'rejected'",
        userId,
        dayStartMs(dayKey(now)),
      ))!.n;
      if (today >= w.withdrawPerDay) return { ok: false, error: fmt(e.wallet.perDay, { n: w.withdrawPerDay }) };
      if (user.balance < amount) return { ok: false, error: e.wallet.insufficient };
      const id = (
        await run(
          `INSERT INTO withdrawals (user_id, amount, bank_code, bank_account, bank_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          userId,
          amount,
          user.bank_code,
          user.bank_account,
          user.bank_name,
          now,
        )
      ).lastId;
      await move(userId, "balance", -amount, "withdraw", { ref: `WD${String(id).padStart(6, "0")}`, note: "ถอนเงิน", now });
      return { ok: true, id };
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) return { ok: false, error: e.wallet.insufficient };
    throw error;
  }
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

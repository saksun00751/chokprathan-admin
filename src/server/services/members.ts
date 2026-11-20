import "server-only";
import { blocksFor } from "./blocklist";
import { BANKS } from "@/domain/banks";
import { closeBlockers, type CloseBlocker } from "@/domain/members";
import { q1, run, tx } from "@/server/db";
import { audit, changes } from "./audit";
import { revokeAllSessions } from "./auth";

/** Staff edits of a member's identity and payout details, and closing/reopening accounts. Every change is audited with before/after. */

export interface MemberEdit {
  name?: string;
  phone?: string;
  bankCode?: string;
  bankAccount?: string;
  bankName?: string;
}

export type MemberEditError = "notFound" | "nothing" | "name" | "phone" | "bank" | "account" | "accountName" | "phoneTaken" | "bankTaken" | "blocked";

type Actor = { id: number; ip: string | null };

/** Blank fields mean "keep". Returns the first problem with the input, or the cleaned values. */
export function cleanMemberEdit(input: MemberEdit): { ok: true; value: MemberEdit } | { ok: false; error: MemberEditError } {
  const value: MemberEdit = {};
  const name = input.name?.trim();
  if (name) {
    if (name.length < 2 || name.length > 80) return { ok: false, error: "name" };
    value.name = name;
  }
  const phone = input.phone?.replace(/\D/g, "");
  if (phone) {
    if (!/^0[689]\d{8}$/.test(phone)) return { ok: false, error: "phone" };
    value.phone = phone;
  }
  if (input.bankCode) {
    if (!BANKS.some((b) => b.code === input.bankCode)) return { ok: false, error: "bank" };
    value.bankCode = input.bankCode;
  }
  const account = input.bankAccount?.replace(/\D/g, "");
  if (account) {
    if (!/^\d{10,15}$/.test(account)) return { ok: false, error: "account" };
    value.bankAccount = account;
  }
  const accountName = input.bankName?.trim();
  if (accountName) {
    if (accountName.length < 2 || accountName.length > 100) return { ok: false, error: "accountName" };
    value.bankName = accountName;
  }
  return { ok: true, value };
}

type Row = { name: string; phone: string | null; bank_code: string | null; bank_account: string | null; bank_name: string | null };

export async function updateMember(
  userId: number,
  input: MemberEdit,
  reason: string,
  actor: Actor,
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; error: MemberEditError }> {
  const cleaned = cleanMemberEdit(input);
  if (!cleaned.ok) return cleaned;
  const v = cleaned.value;
  try {
    return await tx(async () => {
      const row = await q1<Row>("SELECT name, phone, bank_code, bank_account, bank_name FROM users WHERE id = ? AND role = 'member' FOR UPDATE", userId);
      if (!row) return { ok: false as const, error: "notFound" as const };
      const next: Row = {
        name: v.name ?? row.name,
        phone: v.phone ?? row.phone,
        bank_code: v.bankCode ?? row.bank_code,
        bank_account: v.bankAccount ?? row.bank_account,
        bank_name: v.bankName ?? row.bank_name,
      };
      const diff = changes(row, next);
      if (Object.keys(diff.after).length === 0) return { ok: false as const, error: "nothing" as const };
      // New details may not be ones on the blocklist (entries the member already matched don't count).
      const id = (r: Row) => ({ phone: r.phone, bankCode: r.bank_code, bankAccount: r.bank_account, name: r.name, bankName: r.bank_name });
      const before = new Set((await blocksFor(id(row))).map((b) => b.id));
      if ((await blocksFor(id(next))).some((b) => !before.has(b.id))) return { ok: false as const, error: "blocked" as const };
      if (next.phone !== row.phone && (await q1("SELECT 1 FROM users WHERE phone = ? AND id <> ?", next.phone, userId)))
        return { ok: false as const, error: "phoneTaken" as const };
      if (
        (next.bank_code !== row.bank_code || next.bank_account !== row.bank_account) &&
        (await q1("SELECT 1 FROM users WHERE bank_code = ? AND bank_account = ? AND id <> ?", next.bank_code, next.bank_account, userId))
      ) {
        return { ok: false as const, error: "bankTaken" as const };
      }
      await run(
        "UPDATE users SET name = ?, phone = ?, bank_code = ?, bank_account = ?, bank_name = ? WHERE id = ?",
        next.name,
        next.phone,
        next.bank_code,
        next.bank_account,
        next.bank_name,
        userId,
      );
      // The phone number is the sign-in name: a changed one signs the member out everywhere.
      if (next.phone !== row.phone) await revokeAllSessions(userId);
      await audit(actor.id, "member.update", `user:${userId}`, { ...diff, reason }, now, actor.ip);
      return { ok: true as const };
    });
  } catch (error) {
    // Two edits racing for the same phone or bank account: the unique index decides.
    if ((error as { errno?: number }).errno === 1062)
      return { ok: false, error: String((error as Error).message).includes("users_phone") ? "phoneTaken" : "bankTaken" };
    throw error;
  }
}

export type CloseResult = { ok: true } | { ok: false; error: "notFound" | "already" } | { ok: false; blockers: CloseBlocker[] };

/** "Delete" in the back office: the account closes, every record stays, and the phone and bank account stay reserved. */
export async function closeMember(userId: number, reason: string, actor: Actor, now = Date.now()): Promise<CloseResult> {
  return tx(async (): Promise<CloseResult> => {
    // The wallet row lock also waits out any bill or withdrawal being placed right now.
    const u = await q1<{ status: string; balance: number; cashback_balance: number; affiliate_balance: number }>(
      "SELECT status, balance, cashback_balance, affiliate_balance FROM users WHERE id = ? AND role = 'member' FOR UPDATE",
      userId,
    );
    if (!u) return { ok: false, error: "notFound" };
    if (u.status === "closed") return { ok: false, error: "already" };
    const open = await q1<{ b: number; d: number; w: number }>(
      `SELECT (SELECT COUNT(*) FROM bills WHERE user_id = ? AND status = 'pending') AS b,
              (SELECT COUNT(*) FROM deposits WHERE user_id = ? AND status IN ('awaiting','pending')) AS d,
              (SELECT COUNT(*) FROM withdrawals WHERE user_id = ? AND status = 'pending') AS w`,
      userId,
      userId,
      userId,
    );
    const blockers = closeBlockers({
      balance: Number(u.balance),
      cashback: Number(u.cashback_balance),
      affiliate: Number(u.affiliate_balance),
      pendingBills: Number(open?.b ?? 0),
      openDeposits: Number(open?.d ?? 0),
      pendingWithdrawals: Number(open?.w ?? 0),
    });
    if (blockers.length) return { ok: false, blockers };
    await run("UPDATE users SET status = 'closed', closed_at = ?, closed_by = ?, close_reason = ? WHERE id = ?", now, actor.id, reason, userId);
    await revokeAllSessions(userId);
    await audit(actor.id, "member.close", `user:${userId}`, { before: { status: u.status }, after: { status: "closed" }, reason }, now, actor.ip);
    return { ok: true };
  });
}

export async function reopenMember(userId: number, reason: string, actor: Actor, now = Date.now()): Promise<{ ok: true } | { ok: false; error: "notClosed" }> {
  return tx(async () => {
    const u = await q1<{ status: string; close_reason: string | null }>(
      "SELECT status, close_reason FROM users WHERE id = ? AND role = 'member' FOR UPDATE",
      userId,
    );
    if (u?.status !== "closed") return { ok: false as const, error: "notClosed" as const };
    await run("UPDATE users SET status = 'active', closed_at = NULL, closed_by = NULL, close_reason = NULL WHERE id = ?", userId);
    await audit(
      actor.id,
      "member.reopen",
      `user:${userId}`,
      { before: { status: "closed", closeReason: u.close_reason }, after: { status: "active" }, reason },
      now,
      actor.ip,
    );
    return { ok: true as const };
  });
}

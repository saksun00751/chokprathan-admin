import "server-only";
import { BANKS } from "@/domain/banks";
import { applyMove, archiveBlocker, type BankAccountKind } from "@/domain/bank-accounts";
import { q, q1, run, tx } from "@/server/db";
import { audit, changes } from "./audit";

/**
 * The website's bank accounts: deposit accounts (members transfer into them) and withdraw
 * accounts (staff pay out from them). Balances move only through bankMove, which writes a row to
 * bank_account_moves, so every baht can be traced to a deposit, a withdrawal, or a named adjustment.
 */

export interface BankAccount {
  id: number;
  kind: BankAccountKind;
  bankCode: string;
  accountNo: string;
  accountName: string;
  balance: number;
  active: boolean;
  sort: number;
  note: string | null;
  archivedAt: number | null;
}

type Row = {
  id: number;
  kind: BankAccountKind;
  bank_code: string;
  account_no: string;
  account_name: string;
  balance: number;
  active: number;
  sort: number;
  note: string | null;
  archived_at: number | null;
};

const toAccount = (r: Row): BankAccount => ({
  id: Number(r.id),
  kind: r.kind,
  bankCode: r.bank_code,
  accountNo: r.account_no,
  accountName: r.account_name,
  balance: Number(r.balance),
  active: r.active === 1,
  sort: Number(r.sort),
  note: r.note,
  archivedAt: r.archived_at === null ? null : Number(r.archived_at),
});

export async function listBankAccounts({ kind, includeArchived = false }: { kind?: BankAccountKind; includeArchived?: boolean } = {}): Promise<BankAccount[]> {
  const where = [includeArchived ? "1 = 1" : "archived_at IS NULL", ...(kind ? ["kind = ?"] : [])];
  const rows = await q<Row>(`SELECT * FROM bank_accounts WHERE ${where.join(" AND ")} ORDER BY kind, archived_at IS NOT NULL, sort, id`, ...(kind ? [kind] : []));
  return rows.map(toAccount);
}

/** Where a new deposit should be transferred: the first active deposit account. */
export async function receivingAccount(): Promise<BankAccount | null> {
  const r = await q1<Row>("SELECT * FROM bank_accounts WHERE kind = 'deposit' AND active = 1 AND archived_at IS NULL ORDER BY sort, id LIMIT 1");
  return r ? toAccount(r) : null;
}

export async function payoutAccounts(): Promise<BankAccount[]> {
  return (await q<Row>("SELECT * FROM bank_accounts WHERE kind = 'withdraw' AND active = 1 AND archived_at IS NULL ORDER BY sort, id")).map(toAccount);
}

/** Change a balance and record why. Call inside the transaction that justifies the move. */
export async function bankMove(accountId: number, amount: number, kind: "deposit" | "withdrawal" | "adjust", ref: string | null, note: string | null, actorId: number | null, now = Date.now()) {
  const row = await q1<{ balance: number }>("SELECT balance FROM bank_accounts WHERE id = ? FOR UPDATE", accountId);
  if (!row) throw new Error(`bank account ${accountId} not found`);
  const after = applyMove(Number(row.balance), amount);
  await run("UPDATE bank_accounts SET balance = ?, updated_at = ? WHERE id = ?", after, now, accountId);
  await run(
    "INSERT INTO bank_account_moves (account_id, amount, balance_after, kind, ref, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    accountId,
    amount,
    after,
    kind,
    ref,
    note?.slice(0, 255) ?? null,
    actorId,
    now,
  );
  return after;
}

export interface BankAccountInput {
  kind: BankAccountKind;
  bankCode: string;
  accountNo: string;
  accountName: string;
  active: boolean;
  sort: number;
  note: string;
}

export type BankError = "notFound" | "invalid" | "duplicate" | "balance" | "open" | "amount";

function clean(input: BankAccountInput): BankAccountInput | null {
  const accountNo = String(input?.accountNo ?? "").replace(/\D/g, "");
  const accountName = String(input?.accountName ?? "").trim();
  if (input?.kind !== "deposit" && input?.kind !== "withdraw") return null;
  if (!BANKS.some((b) => b.code === input.bankCode)) return null;
  if (!/^\d{10,15}$/.test(accountNo) || accountName.length < 2 || accountName.length > 100) return null;
  const sort = Number.isInteger(input.sort) ? Math.max(0, Math.min(999, input.sort)) : 0;
  return { kind: input.kind, bankCode: input.bankCode, accountNo, accountName, active: !!input.active, sort, note: String(input.note ?? "").trim().slice(0, 255) };
}

/** Create (id null) or edit an account. The balance is never edited here: only adjustments move it. */
export async function saveBankAccount(id: number | null, input: BankAccountInput, actor: { id: number; ip: string | null }, now = Date.now()): Promise<{ ok: true; id: number } | { ok: false; error: BankError }> {
  const v = clean(input);
  if (!v) return { ok: false, error: "invalid" };
  return tx(async () => {
    const twin = await q1<{ id: number }>(
      "SELECT id FROM bank_accounts WHERE kind = ? AND bank_code = ? AND account_no = ? AND archived_at IS NULL AND id <> ?",
      v.kind,
      v.bankCode,
      v.accountNo,
      id ?? 0,
    );
    if (twin) return { ok: false as const, error: "duplicate" as const };
    if (id === null) {
      const newId = (
        await run(
          "INSERT INTO bank_accounts (kind, bank_code, account_no, account_name, active, sort, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          v.kind,
          v.bankCode,
          v.accountNo,
          v.accountName,
          v.active ? 1 : 0,
          v.sort,
          v.note || null,
          now,
          now,
        )
      ).lastId;
      await audit(actor.id, "bank.create", `bank:${newId}`, { after: v }, now, actor.ip);
      return { ok: true as const, id: Number(newId) };
    }
    const row = await q1<Row>("SELECT * FROM bank_accounts WHERE id = ? AND archived_at IS NULL FOR UPDATE", id);
    if (!row) return { ok: false as const, error: "notFound" as const };
    const before = toAccount(row);
    await run(
      "UPDATE bank_accounts SET kind = ?, bank_code = ?, account_no = ?, account_name = ?, active = ?, sort = ?, note = ?, updated_at = ? WHERE id = ?",
      v.kind,
      v.bankCode,
      v.accountNo,
      v.accountName,
      v.active ? 1 : 0,
      v.sort,
      v.note || null,
      now,
      id,
    );
    await audit(
      actor.id,
      "bank.update",
      `bank:${id}`,
      changes(
        { kind: before.kind, bankCode: before.bankCode, accountNo: before.accountNo, accountName: before.accountName, active: before.active, sort: before.sort, note: before.note ?? "" },
        v,
      ),
      now,
      actor.ip,
    );
    return { ok: true as const, id };
  });
}

/** "Delete": hidden from use, history kept. Only at zero balance with no deposit still heading to it. */
export async function archiveBankAccount(id: number, actor: { id: number; ip: string | null }, now = Date.now()): Promise<{ ok: true } | { ok: false; error: BankError }> {
  return tx(async () => {
    const row = await q1<Row>("SELECT * FROM bank_accounts WHERE id = ? AND archived_at IS NULL FOR UPDATE", id);
    if (!row) return { ok: false as const, error: "notFound" as const };
    const open = await q1<{ n: number }>("SELECT COUNT(*) AS n FROM deposits WHERE bank_account_id = ? AND status IN ('awaiting','pending')", id);
    const blocker = archiveBlocker({ balance: Number(row.balance), openDeposits: Number(open?.n ?? 0) });
    if (blocker) return { ok: false as const, error: blocker };
    await run("UPDATE bank_accounts SET archived_at = ?, archived_by = ?, active = 0, updated_at = ? WHERE id = ?", now, actor.id, now, id);
    await audit(actor.id, "bank.archive", `bank:${id}`, { before: { archived: false }, after: { archived: true }, account: `${row.bank_code} ${row.account_no}` }, now, actor.ip);
    return { ok: true as const };
  });
}

/** A named correction (bank fee, money moved between accounts, counting error). */
export async function adjustBankAccount(id: number, amount: number, note: string, actor: { id: number; ip: string | null }, now = Date.now()): Promise<{ ok: true; balance: number } | { ok: false; error: BankError }> {
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100_000_000_00) return { ok: false, error: "amount" };
  return tx(async () => {
    const row = await q1<{ balance: number }>("SELECT balance FROM bank_accounts WHERE id = ? AND archived_at IS NULL", id);
    if (!row) return { ok: false as const, error: "notFound" as const };
    const balance = await bankMove(id, amount, "adjust", null, note, actor.id, now);
    await audit(actor.id, "bank.adjust", `bank:${id}`, { before: { balance: balance - amount }, after: { balance }, amount, reason: note }, now, actor.ip);
    return { ok: true as const, balance };
  });
}

export interface BankMoveRow {
  id: number;
  amount: number;
  balance_after: number;
  kind: "deposit" | "withdrawal" | "adjust";
  ref: string | null;
  note: string | null;
  created_at: number;
  staff: string | null;
}

export async function bankMoves(accountId: number, limit = 100): Promise<BankMoveRow[]> {
  return q<BankMoveRow>(
    `SELECT m.id, m.amount, m.balance_after, m.kind, m.ref, m.note, m.created_at, COALESCE(u.username, u.name) AS staff
     FROM bank_account_moves m LEFT JOIN users u ON u.id = m.actor_id
     WHERE m.account_id = ? ORDER BY m.id DESC LIMIT ?`,
    accountId,
    limit,
  );
}

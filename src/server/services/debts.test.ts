import { beforeEach, describe, expect, test } from "vitest";
import { q, q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { listDebts, writeOffDebt } from "./debts";
import { approveDeposit, approveWithdrawal } from "./finance";

const now = Date.UTC(2026, 10, 4, 5, 0);

describe.skipIf(!hasTestDb)("member debts in the back office", () => {
  let user: number;
  let debt: number;

  beforeEach(async () => {
    await resetDb();
    user = (await run("INSERT INTO users (password_hash, ref_code, created_at) VALUES ('x', 'ADEBT001', ?)", now)).lastId;
    debt = (await run("INSERT INTO member_debts (user_id, amount, outstanding, created_at) VALUES (?, 74900, 74900, ?)", user, now)).lastId;
  });

  const balance = async () => (await q1<{ balance: number }>("SELECT balance FROM users WHERE id = ?", user))!.balance;

  test("an approved deposit repays the debt first", async () => {
    const deposit = (await run("INSERT INTO deposits (user_id, amount, status, expires_at, created_at) VALUES (?, 100000, 'pending', ?, ?)", user, now + 1000, now)).lastId;
    expect((await approveDeposit(deposit, 1, now)).ok).toBe(true);
    expect(await balance()).toBe(25_100);
    expect(await listDebts(user)).toMatchObject([{ id: debt, outstanding: 0 }]);
  });

  test("a waiting withdrawal cannot be approved while the member owes", async () => {
    const id = (
      await run("INSERT INTO withdrawals (user_id, amount, bank_code, bank_account, bank_name, created_at) VALUES (?, 50000, 'kbank', '1', 'x', ?)", user, now)
    ).lastId;
    expect((await approveWithdrawal(id, 1, now)).ok).toBe(false);
    expect(await q1("SELECT status FROM withdrawals WHERE id = ?", id)).toEqual({ status: "pending" });
  });

  test("forgiving a debt needs a reason and is recorded", async () => {
    expect(await writeOffDebt(debt, 7, "  a ", now)).toEqual({ ok: false, error: "reason" });
    expect(await writeOffDebt(999999, 7, "mistake", now)).toEqual({ ok: false, error: "notFound" });
    expect(await writeOffDebt(debt, 7, "our mistake", now)).toEqual({ ok: true, amount: 74_900 });
    expect(await q1("SELECT outstanding, written_off, written_off_by, reason FROM member_debts WHERE id = ?", debt)).toEqual({
      outstanding: 0,
      written_off: 74_900,
      written_off_by: 7,
      reason: "our mistake",
    });
    expect(await writeOffDebt(debt, 7, "our mistake", now)).toEqual({ ok: false, error: "nothing" });
    expect(await q("SELECT action FROM audit_log WHERE target = ?", `user:${user}`)).toEqual([{ action: "debt.writeoff" }]);
    expect(await balance()).toBe(0);
  });
});

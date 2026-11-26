import { beforeEach, describe, expect, test, vi } from "vitest";
import th from "@/i18n/locales/th";
import { invalidate } from "@/server/cache";
import { json, q, q1, run } from "@/server/db";
import { changedDays } from "@/server/stats/build";
import { dayOf } from "@/server/stats/derive";
import { DAY } from "@/core/rules/time";
import { hasTestDb, resetDb } from "@/test/db";
import { applyCorrection, correctResult, previewCorrection, type ApplyHooks, type Change } from "./correction";
import { approveDeposit, approveWithdrawal } from "./finance";
import { resumeSettlements } from "./rounds";
import { settlePending } from "./settlement";

const STAFF = 1;
const now = 10_000;
const WIN = { top3: "925", bottom2: "49" }; // top2 = 25
const LOSE = { top3: "911", bottom2: "49" }; // top2 = 11

describe.skipIf(!hasTestDb)("correcting a paid result", () => {
  let lotto: number;
  let round: number;
  let up: number;
  let member: number;

  const user = async (code: string, upline: number | null = null) =>
    (await run("INSERT INTO users (password_hash, ref_code, upline1_id, created_at) VALUES ('x', ?, ?, 1)", code, upline)).lastId;
  const bill = async (code: string, owner: number, number: string, net = 1000) => {
    const id = (await run("INSERT INTO bills (code, user_id, round_id, total_stake, created_at) VALUES (?, ?, ?, ?, 1)", code, owner, round, net)).lastId;
    await run("INSERT INTO bill_items (bill_id, round_id, bet_type, number, stake, segments, rate100, potential) VALUES (?, ?, 'top2', ?, 10, '[]', 9500, 95000)", id, round, number);
    return id;
  };
  const wallets = async (id: number) => {
    const w = (await q1<{ balance: number; cashback_balance: number; affiliate_balance: number }>("SELECT balance, cashback_balance, affiliate_balance FROM users WHERE id = ?", id))!;
    return [w.balance, w.cashback_balance, w.affiliate_balance];
  };
  const owed = async (id: number) => Number((await q1<{ n: string | null }>("SELECT SUM(outstanding) AS n FROM member_debts WHERE user_id = ?", id))!.n ?? 0);
  const pay = async () => {
    await run("UPDATE rounds SET status = 'resulted', result = ?, resulted_at = 5 WHERE id = ?", json.str(WIN), round);
    await settlePending(round, 6);
  };
  const changeTo = (to: typeof WIN | "void"): Change => (to === "void" ? { kind: "cancel" } : { kind: "correction", input: to });
  /** The payout the screen was showing when it previewed. */
  const basis = async () => Number((await q1<{ id: number | null }>("SELECT MAX(id) AS id FROM settlement_runs"))!.id ?? 0);
  const apply = async (to: typeof WIN | "void", at = now, hooks: ApplyHooks = {}) => correctResult(round, changeTo(to), "wrong official result", await basis(), STAFF, at, hooks);
  const correct = async (to: typeof WIN | "void") => expect(await apply(to)).toEqual({ ok: true });

  beforeEach(async () => {
    await resetDb();
    await run("DELETE FROM bills");
    await run("DELETE FROM rounds");
    await run("DELETE FROM lottos");
    await run("INSERT INTO settings (`key`, `value`, updated_at) VALUES ('rewards', ?, 1) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)", json.str({ cashbackBp: 1000, aff1Bp: 100, aff2Bp: 0 }));
    lotto = (await run("INSERT INTO lottos (slug, name, short_name, grp, format, schedule, rates, limits, risk) VALUES ('c','c','c','foreign','standard','{}','{}','{}','{}')")).lastId;
    invalidate("lottos", "settings");
    round = (await run("INSERT INTO rounds (lotto_id, day_key, opens_at, closes_at, draw_at) VALUES (?, '1970-01-01', 1, 2, 3)", lotto)).lastId;
    up = await user("CORR0002");
    member = await user("CORR0001", up);
  });

  test("takes back what the member still has, makes the rest a debt, and later credit repays it", async () => {
    await bill("CPA", member, "25");
    await pay();
    expect(await wallets(member)).toEqual([95_000, 0, 0]);
    await run("UPDATE users SET balance = 20000 WHERE id = ?", member);

    await correct(LOSE);
    expect(await wallets(member)).toEqual([0, 0, 0]);
    expect(await owed(member)).toBe(74_900);
    expect(await q1("SELECT status, total_payout, cashback_paid FROM bills WHERE code = 'CPA'")).toEqual({ status: "lost", total_payout: 0, cashback_paid: 100 });
    expect(await q1("SELECT status, result, settled_at FROM rounds WHERE id = ?", round)).toMatchObject({ status: "resulted", settled_at: now });
    expect(await q("SELECT kind, status FROM settlement_runs WHERE round_id = ? ORDER BY id", round)).toEqual([
      { kind: "result", status: "done" },
      { kind: "correction", status: "done" },
    ]);

    const deposit = (await run("INSERT INTO deposits (user_id, amount, status, expires_at, created_at) VALUES (?, 100000, 'pending', ?, ?)", member, now + 1000, now)).lastId;
    expect((await approveDeposit(deposit, 1, now)).ok).toBe(true);
    expect(await wallets(member)).toEqual([25_100, 0, 0]);
    expect(await owed(member)).toBe(0);
  });

  test("pays a new winner and takes the cashback and nothing from the upline's commission", async () => {
    await bill("CPB", member, "11");
    await pay();
    expect(await wallets(member)).toEqual([0, 100, 0]);
    expect(await wallets(up)).toEqual([0, 0, 10]);

    await correct(LOSE);
    expect(await wallets(member)).toEqual([95_000, 0, 0]);
    expect(await wallets(up)).toEqual([0, 0, 10]);
    expect(await owed(member)).toBe(0);
  });

  test("writes nothing for a bill whose outcome does not change", async () => {
    await bill("CPC", member, "25");
    await pay();
    await correct({ top3: "525", bottom2: "00" });
    expect(await wallets(member)).toEqual([95_000, 0, 0]);
    expect(await q("SELECT 1 FROM transactions WHERE run_id = (SELECT MAX(id) FROM settlement_runs)")).toEqual([]);
  });

  test("voiding refunds what was paid, removes cashback and commission, and restores turnover", async () => {
    await bill("CPD", member, "11");
    await run("UPDATE users SET turnover_required = 5000 WHERE id = ?", member);
    await pay();
    expect((await q1("SELECT turnover_required FROM users WHERE id = ?", member))).toEqual({ turnover_required: 4000 });

    await correct("void");
    expect(await wallets(member)).toEqual([1000, 0, 0]);
    expect(await wallets(up)).toEqual([0, 0, 0]);
    expect(await q1("SELECT turnover_required FROM users WHERE id = ?", member)).toEqual({ turnover_required: 5000 });
    expect(await q1("SELECT status FROM rounds WHERE id = ?", round)).toEqual({ status: "cancelled" });
    expect(await q1("SELECT status, cashback_paid, aff1_paid FROM bills WHERE code = 'CPD'")).toEqual({ status: "refunded", cashback_paid: 0, aff1_paid: 0 });
    // The ordinary settlement leaves a corrected round alone.
    expect(await settlePending(round, now + 1)).toEqual({ bills: 0, items: 0 });
  });

  test("a second correction pays only the new difference", async () => {
    await bill("CPE", member, "25");
    await pay();
    await correct(LOSE);
    await correct(WIN);
    expect(await wallets(member)).toEqual([95_000, 0, 0]);
    expect(await owed(member)).toBe(0);
  });

  test("an interrupted run resumes without paying anyone twice", async () => {
    await bill("CPF", member, "25");
    await bill("CPG", up, "11");
    await pay();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Make the second member's step fail once.
    await run("UPDATE users SET cashback_balance = cashback_balance WHERE id = ?", member);
    await apply(LOSE, now, { onMember: (n) => { if (n === 1) throw new Error("crash"); } }).catch(() => {});
    spy.mockRestore();
    expect(await q1("SELECT settled_at FROM rounds WHERE id = ?", round)).toEqual({ settled_at: null });
    expect(await resumeSettlements(now + 1)).toBe(1);
    await applyCorrection(round, now + 2);
    expect(await q1("SELECT status FROM settlement_runs WHERE kind = 'correction'")).toEqual({ status: "done" });
    expect(await q("SELECT user_id, COUNT(*) AS n FROM correction_members GROUP BY user_id ORDER BY user_id")).toEqual([
      { user_id: up, n: 1 },
      { user_id: member, n: 1 },
    ].sort((a, b) => a.user_id - b.user_id));
    // up: now wins 95000 and gives back 100 cashback; member: loses the 95000 and gains 100 cashback.
    expect(await wallets(up)).toEqual([95_000, 0, expect.any(Number)]);
    expect(await wallets(member)).toEqual([0, 100, 0]);
  });

  test("needs a settled round, a reason and a real change", async () => {
    await bill("CPH", member, "25");
    const ask = async (change: Change, reason = "wrong result") => correctResult(round, change, reason, await basis(), STAFF, now);
    expect((await ask({ kind: "cancel" })).ok).toBe(false);
    await pay();
    expect((await ask({ kind: "cancel" }, " x ")).ok).toBe(false);
    expect((await ask({ kind: "correction", input: WIN })).ok).toBe(false);
    expect(await ask({ kind: "correction", input: LOSE })).toEqual({ ok: true });
  });

  test("refuses rounds paid before entitlements were recorded", async () => {
    await bill("CPI", member, "25");
    await pay();
    await run("UPDATE bills SET cashback_paid = NULL WHERE round_id = ?", round);
    expect((await apply("void")).ok).toBe(false);
    expect((await previewCorrection(round, { kind: "cancel" })).ok).toBe(false);
  });

  test("shows the effect without moving money, then applies once", async () => {
    await bill("CPJ", member, "25");
    await pay();
    await run("UPDATE users SET balance = 20000 WHERE id = ?", member);
    const seen = await basis();
    expect(await previewCorrection(round, changeTo(LOSE))).toEqual({
      ok: true,
      preview: { basis: seen, members: [{ userId: member, name: "", change: -94_900, shortfall: 75_000 }], change: -94_900, shortfall: 75_000 },
    });
    expect(await wallets(member)).toEqual([20_000, 0, 0]);
    const send = () => correctResult(round, changeTo(LOSE), "wrong result", seen, STAFF, now);
    const both = await Promise.all([send(), send()]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(await owed(member)).toBe(74_900);
    expect(await q1("SELECT status, entered_by, confirmed_by, reason FROM round_results WHERE kind = 'correction'")).toEqual({
      status: "confirmed",
      entered_by: STAFF,
      confirmed_by: STAFF,
      reason: "wrong result",
    });
  });

  test("keeps the day a bill was paid, and has reports rebuild both its days", async () => {
    await bill("CPM", member, "25");
    await run("UPDATE rounds SET status = 'resulted', result = ?, resulted_at = 5 WHERE id = ?", json.str(WIN), round);
    await settlePending(round, 3 * DAY);
    const later = 10 * DAY;
    expect(await apply(LOSE, later)).toEqual({ ok: true });
    expect(await q1("SELECT settled_at FROM bills WHERE code = 'CPM'")).toEqual({ settled_at: 3 * DAY });
    expect((await changedDays(later - 1)).sort((a, b) => a - b)).toEqual([dayOf(1), dayOf(3 * DAY)]);
  });

  test("never applies over a correction made since the preview", async () => {
    await bill("CPP", member, "25");
    await pay();
    const seen = await basis();
    await correct(LOSE);
    expect(await correctResult(round, { kind: "cancel" }, "void instead", seen, STAFF, now)).toEqual({ ok: false, error: th.errors.rounds.correctionChanged });
    expect(await q1("SELECT status FROM rounds WHERE id = ?", round)).toEqual({ status: "resulted" });
  });

  test("replaces a request left waiting by the old two-person check", async () => {
    await bill("CPT", member, "25");
    await pay();
    await run("INSERT INTO round_results (round_id, kind, entered_by, entered_at, reason) VALUES (?, 'cancel', ?, 1, 'old request')", round, STAFF);
    await correct(LOSE);
    expect(await q("SELECT 1 FROM round_results WHERE round_id = ? AND status = 'pending'", round)).toEqual([]);
  });

  test("says a withdrawal blocked by a mismatched correction needs staff to look, not to wait", async () => {
    await bill("CPQ", member, "25");
    await pay();
    await correct(LOSE);
    const withdrawal = (await run("INSERT INTO withdrawals (user_id, amount, bank_code, bank_account, bank_name, created_at) VALUES (?, 100, 'x', 'x', 'x', 1)", member)).lastId;
    await run("UPDATE settlement_runs SET status = 'running' WHERE kind = 'correction'");
    expect(await approveWithdrawal(withdrawal, 1, now)).toEqual({ ok: false, error: th.errors.wallet.correctionRunning });
    await run("UPDATE settlement_runs SET status = 'mismatch' WHERE kind = 'correction'");
    expect(await approveWithdrawal(withdrawal, 1, now)).toEqual({ ok: false, error: th.errors.wallet.correctionMismatch });
  });

  test("voiding gives back only the turnover the payout really used", async () => {
    await bill("CPO", member, "11");
    await pay();
    await correct("void");
    expect(await q1("SELECT turnover_required FROM users WHERE id = ?", member)).toEqual({ turnover_required: 0 });
  });

  test("shares a smaller turnover requirement over the bills in order and restores exactly that", async () => {
    await bill("CPP", member, "11");
    await bill("CPQ", member, "11");
    await run("UPDATE users SET turnover_required = 1500 WHERE id = ?", member);
    await pay();
    expect(await q("SELECT turnover_taken FROM bills WHERE round_id = ? ORDER BY id", round)).toEqual([{ turnover_taken: 1000 }, { turnover_taken: 500 }]);
    await correct("void");
    expect(await q1("SELECT turnover_required FROM users WHERE id = ?", member)).toEqual({ turnover_required: 1500 });
  });

  test("takes nothing for an old debt when the correction brings a wallet no new money", async () => {
    await bill("CPR", member, "25");
    await bill("CPS", member, "11");
    await pay();
    await run("UPDATE users SET cashback_balance = 600 WHERE id = ?", member);
    await run("INSERT INTO member_debts (user_id, amount, outstanding, created_at) VALUES (?, 1000, 1000, 1)", member);
    // The two bills swap places: every wallet ends where it started.
    await correct(LOSE);
    expect(await wallets(member)).toEqual([95_000, 600, 0]);
    expect(await owed(member)).toBe(1000);
  });

  test("holds back withdrawals of the members involved while it is being applied", async () => {
    await bill("CPL", member, "25");
    await pay();
    await run("INSERT INTO settlement_runs (round_id, kind, created_at) VALUES (?, 'correction', ?)", round, now);
    for (const id of [member, up]) {
      const w = (await run("INSERT INTO withdrawals (user_id, amount, bank_code, bank_account, bank_name, created_at) VALUES (?, 100, 'kbank', '1', 'x', ?)", id, now)).lastId;
      expect((await approveWithdrawal(w, 1, now)).ok).toBe(false);
    }
  });
});

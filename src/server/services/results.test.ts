import { beforeEach, describe, expect, test } from "vitest";
import { invalidate } from "@/server/cache";
import { q, q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { checkResult, confirmResult, enterResult, rejectResult } from "./results";
import { cancelRound, drawResult } from "./rounds";

const ENTERER = 1;
const CHECKER = 2;
const right = { top3: "925", bottom2: "49" };
const now = 10_000;

describe.skipIf(!hasTestDb)("results confirmed by a second person", () => {
  let lotto: number;
  let round: number;
  let user: number;

  const addLotto = async (slug: string, grp: string, auto: number) => {
    const id = (
      await run(
        `INSERT INTO lottos (slug, name, short_name, grp, format, schedule, auto_result, rates, limits, risk)
         VALUES (?, ?, ?, ?, 'standard', '{"kind":"weekly","days":[1],"close":"20:00"}', ?, '{}', '{}', '{}')`,
        slug,
        slug,
        slug,
        grp,
        auto,
      )
    ).lastId;
    invalidate("lottos");
    return id;
  };
  const addRound = async (lottoId: number, closesAt: number) =>
    (await run("INSERT INTO rounds (lotto_id, day_key, opens_at, closes_at, draw_at) VALUES (?, '1970-01-01', 1, ?, ?)", lottoId, closesAt, closesAt + 1)).lastId;
  const addBill = async (code: string, number: string) => {
    const bill = (await run("INSERT INTO bills (code, user_id, round_id, total_stake, created_at) VALUES (?, ?, ?, 1000, 1)", code, user, round)).lastId;
    await run("INSERT INTO bill_items (bill_id, round_id, bet_type, number, stake, segments, rate100, potential) VALUES (?, ?, 'top2', ?, 10, '[]', 9500, 95000)", bill, round, number);
  };
  const state = () => q1<{ status: string; result: string | null; resulted_by: number | null }>("SELECT status, result, resulted_by FROM rounds WHERE id = ?", round);
  const balance = async () => (await q1<{ balance: number }>("SELECT balance FROM users WHERE id = ?", user))!.balance;

  beforeEach(async () => {
    await resetDb();
    await run("DELETE FROM bills");
    await run("DELETE FROM rounds");
    await run("DELETE FROM lottos");
    lotto = await addLotto("t", "foreign", 0);
    round = await addRound(lotto, 5000);
    user = (await run("INSERT INTO users (password_hash, ref_code, created_at) VALUES ('x', 'TWOP0001', 1)")).lastId;
    await addBill("CPTWO1", "25");
    await addBill("CPTWO2", "11");
  });

  test("typing a result pays nothing and keeps the digits out of the round and the audit log", async () => {
    expect(await enterResult(round, right, ENTERER, now)).toEqual({ ok: true });
    expect(await state()).toEqual({ status: "pending_confirm", result: null, resulted_by: null });
    expect(await balance()).toBe(0);
    const log = await q<{ action: string; detail: string | null }>("SELECT action, detail FROM audit_log WHERE target = ?", `round:${round}`);
    expect(log.map((l) => l.action)).toEqual(["round.result.enter"]);
    expect(JSON.stringify(log)).not.toContain("925");
  });

  test("refuses a result before closing, and a second one while one waits", async () => {
    expect((await enterResult(round, right, ENTERER, 4999)).ok).toBe(false);
    expect((await enterResult(round, { top3: "9", bottom2: "49" }, ENTERER, now)).ok).toBe(false);
    await enterResult(round, right, ENTERER, now);
    expect((await enterResult(round, right, CHECKER, now)).ok).toBe(false);
    expect(await q("SELECT id FROM round_results WHERE round_id = ?", round)).toHaveLength(1);
  });

  test("the person who typed it may neither check nor confirm it", async () => {
    await enterResult(round, right, ENTERER, now);
    expect(await checkResult(round, right, ENTERER, now)).toMatchObject({ ok: false, reason: "sameUser" });
    expect(await confirmResult(round, right, ENTERER, now)).toMatchObject({ ok: false, reason: "sameUser" });
    expect((await state())!.status).toBe("pending_confirm");
  });

  test("names the boxes that differ, pays nothing, and logs the attempt without digits", async () => {
    await enterResult(round, right, ENTERER, now);
    const wrong = { top3: "925", bottom2: "50" };
    expect(await checkResult(round, wrong, CHECKER, now)).toMatchObject({ ok: false, reason: "mismatch", fields: ["bottom2"] });
    expect(await confirmResult(round, wrong, CHECKER, now)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(await balance()).toBe(0);
    const log = await q<{ detail: string | null }>("SELECT detail FROM audit_log WHERE action = 'round.result.mismatch'");
    expect(log).toHaveLength(2);
    expect(JSON.stringify(log)).not.toMatch(/925|49|50/);
  });

  test("shows what a matching result will pay before paying it", async () => {
    await enterResult(round, right, ENTERER, now);
    expect(await checkResult(round, right, CHECKER, now)).toEqual({ ok: true, preview: { bills: 2, winners: 1, payout: 95000 } });
    expect(await balance()).toBe(0);
  });

  test("confirming pays once, even when sent twice at the same moment", async () => {
    await enterResult(round, right, ENTERER, now);
    const both = await Promise.all([confirmResult(round, right, CHECKER, now), confirmResult(round, right, 3, now)]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(await state()).toMatchObject({ status: "resulted" });
    expect(await balance()).toBe(95000);
    expect(await q("SELECT 1 FROM transactions WHERE type = 'win'")).toHaveLength(1);
    expect(await q1("SELECT status, entered_by FROM round_results WHERE round_id = ?", round)).toEqual({ status: "confirmed", entered_by: ENTERER });
    expect(await q1("SELECT status FROM settlement_runs WHERE round_id = ?", round)).toEqual({ status: "done" });
  });

  test("a rejected result goes back to waiting for entry", async () => {
    await enterResult(round, right, ENTERER, now);
    expect(await rejectResult(round, CHECKER, { ownOnly: false }, now)).toEqual({ ok: true });
    expect((await state())!.status).toBe("scheduled");
    expect((await enterResult(round, right, ENTERER, now)).ok).toBe(true);
  });

  test("withdrawing is limited to one's own result", async () => {
    await enterResult(round, right, ENTERER, now);
    expect(await rejectResult(round, CHECKER, { ownOnly: true }, now)).toMatchObject({ ok: false });
    expect(await rejectResult(round, ENTERER, { ownOnly: true }, now)).toEqual({ ok: true });
  });

  test("cancelling a waiting round refunds it and retires the typed result", async () => {
    await enterResult(round, right, ENTERER, now);
    expect(await cancelRound(round, CHECKER, now)).toMatchObject({ ok: true, refunded: 2 });
    expect(await balance()).toBe(2000);
    expect(await q1("SELECT status FROM round_results WHERE round_id = ?", round)).toEqual({ status: "superseded" });
    expect((await confirmResult(round, right, CHECKER, now)).ok).toBe(false);
  });

  test("only the house game may draw itself, confirmed as the system", async () => {
    expect((await drawResult(round, right, now)).ok).toBe(false);
    const yiki = await addRound(await addLotto("y", "yiki", 1), 5000);
    expect((await drawResult(yiki, right, now)).ok).toBe(true);
    expect(await q1("SELECT status, entered_by, confirmed_by FROM round_results WHERE round_id = ?", yiki)).toEqual({ status: "confirmed", entered_by: null, confirmed_by: null });
  });
});

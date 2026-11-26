import { beforeEach, describe, expect, test } from "vitest";
import { invalidate } from "@/server/cache";
import { q, q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { previewResult, submitResult } from "./results";
import { cancelRound, drawResult } from "./rounds";

const STAFF = 1;
const OTHER = 2;
const right = { top3: "925", bottom2: "49" };
const now = 10_000;

describe.skipIf(!hasTestDb)("results entered by one person", () => {
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

  test("shows what a result will pay and writes nothing", async () => {
    expect(await previewResult(round, right, now)).toEqual({ ok: true, preview: { bills: 2, winners: 1, payout: 95000 } });
    expect(await state()).toEqual({ status: "scheduled", result: null, resulted_by: null });
    expect(await q("SELECT id FROM round_results WHERE round_id = ?", round)).toEqual([]);
    expect(await balance()).toBe(0);
  });

  test("one person's result pays at once and records who entered it", async () => {
    expect(await submitResult(round, right, STAFF, now)).toEqual({ ok: true });
    expect(await state()).toMatchObject({ status: "resulted", resulted_by: STAFF });
    expect(await balance()).toBe(95000);
    expect(await q1("SELECT status, entered_by, confirmed_by FROM round_results WHERE round_id = ?", round)).toEqual({ status: "confirmed", entered_by: STAFF, confirmed_by: STAFF });
    expect(await q1("SELECT status FROM settlement_runs WHERE round_id = ?", round)).toEqual({ status: "done" });
    expect((await q1("SELECT actor_id FROM audit_log WHERE action = 'round.result' AND target = ?", `round:${round}`))).toBeTruthy();
  });

  test("refuses a result before closing, an incomplete one, and a second one", async () => {
    expect((await previewResult(round, right, 4999)).ok).toBe(false);
    expect((await submitResult(round, right, STAFF, 4999)).ok).toBe(false);
    expect((await submitResult(round, { top3: "9", bottom2: "49" }, STAFF, now)).ok).toBe(false);
    expect((await submitResult(round, right, STAFF, now)).ok).toBe(true);
    expect((await previewResult(round, right, now)).ok).toBe(false);
    expect((await submitResult(round, right, OTHER, now)).ok).toBe(false);
    expect(await q("SELECT id FROM round_results WHERE round_id = ?", round)).toHaveLength(1);
  });

  test("pays once, even when sent twice at the same moment", async () => {
    const both = await Promise.all([submitResult(round, right, STAFF, now), submitResult(round, right, OTHER, now)]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(await balance()).toBe(95000);
    expect(await q("SELECT 1 FROM transactions WHERE type = 'win'")).toHaveLength(1);
  });

  test("replaces a result left waiting by the old two-person check", async () => {
    await run("INSERT INTO round_results (round_id, result, entered_by, entered_at) VALUES (?, '{}', ?, 1)", round, STAFF);
    await run("UPDATE rounds SET status = 'pending_confirm' WHERE id = ?", round);
    expect(await submitResult(round, right, STAFF, now)).toEqual({ ok: true });
    expect(await q("SELECT status FROM round_results WHERE round_id = ? ORDER BY id", round)).toEqual([{ status: "superseded" }, { status: "confirmed" }]);
    expect(await balance()).toBe(95000);
  });

  test("cancelling a closed round refunds it and refuses a later result", async () => {
    expect(await cancelRound(round, STAFF, now)).toMatchObject({ ok: true, refunded: 2 });
    expect(await balance()).toBe(2000);
    expect((await submitResult(round, right, STAFF, now)).ok).toBe(false);
  });

  test("only the house game may draw itself, confirmed as the system", async () => {
    expect((await drawResult(round, right, now)).ok).toBe(false);
    const yiki = await addRound(await addLotto("y", "yiki", 1), 5000);
    expect((await drawResult(yiki, right, now)).ok).toBe(true);
    expect(await q1("SELECT status, entered_by, confirmed_by FROM round_results WHERE round_id = ?", yiki)).toEqual({ status: "confirmed", entered_by: null, confirmed_by: null });
  });
});

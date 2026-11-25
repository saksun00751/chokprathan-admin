import { beforeEach, describe, expect, test } from "vitest";
import { json, q, q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { settlePending } from "./settlement";

describe.skipIf(!hasTestDb)("what each paid bill entitled whom to", () => {
  let round: number;
  let up1: number;
  let up2: number;
  let member: number;

  beforeEach(async () => {
    await resetDb();
    await run("DELETE FROM bills");
    await run("DELETE FROM rounds");
    await run("DELETE FROM lottos");
    await run("INSERT INTO settings (`key`, `value`, updated_at) VALUES ('rewards', ?, 1) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)", json.str({ cashbackBp: 1000, aff1Bp: 100, aff2Bp: 50 }));
    const lotto = (await run("INSERT INTO lottos (slug, name, short_name, grp, format, schedule, rates, limits, risk) VALUES ('en','en','en','foreign','standard','{}','{}','{}','{}')")).lastId;
    round = (
      await run("INSERT INTO rounds (lotto_id, day_key, opens_at, closes_at, draw_at, status, result) VALUES (?, '1970-01-01', 1, 2, 3, 'resulted', ?)", lotto, json.str({ top3: "925", bottom2: "49" }))
    ).lastId;
    const user = async (code: string, a: number | null, b: number | null) =>
      (await run("INSERT INTO users (password_hash, ref_code, upline1_id, upline2_id, created_at) VALUES ('x', ?, ?, ?, 1)", code, a, b)).lastId;
    up2 = await user("ENT00003", null, null);
    up1 = await user("ENT00002", up2, null);
    member = await user("ENT00001", up1, up2);
    for (const [code, number] of [["CPLOSE", "11"], ["CPWIN", "25"]]) {
      const bill = (await run("INSERT INTO bills (code, user_id, round_id, total_stake, created_at) VALUES (?, ?, ?, 10000, 1)", code, member, round)).lastId;
      await run("INSERT INTO bill_items (bill_id, round_id, bet_type, number, stake, segments, rate100, potential) VALUES (?, ?, 'top2', ?, 100, '[]', 9500, 950000)", bill, round, number);
    }
  });

  const bills = () =>
    q("SELECT code, cashback_paid, aff1_user, aff1_paid, aff2_user, aff2_paid FROM bills WHERE round_id = ? ORDER BY code", round);

  test("is recorded on the bill for a loser and a winner", async () => {
    await settlePending(round, 10);
    expect(await bills()).toEqual([
      { code: "CPLOSE", cashback_paid: 1000, aff1_user: up1, aff1_paid: 100, aff2_user: up2, aff2_paid: 50 },
      { code: "CPWIN", cashback_paid: 0, aff1_user: up1, aff1_paid: 100, aff2_user: up2, aff2_paid: 50 },
    ]);
  });

  test("keeps the reward rates the run paid with", async () => {
    await settlePending(round, 10);
    const row = await q1<{ rewards: string }>("SELECT rewards FROM settlement_runs WHERE round_id = ?", round);
    expect(JSON.parse(row!.rewards)).toEqual({ cashbackBp: 1000, aff1Bp: 100, aff2Bp: 50 });
  });

  test("is zero for a refunded bill", async () => {
    await run("UPDATE rounds SET status = 'cancelled', result = NULL WHERE id = ?", round);
    await settlePending(round, 10);
    expect(await q("SELECT DISTINCT cashback_paid, aff1_paid, aff2_paid FROM bills WHERE round_id = ?", round)).toEqual([{ cashback_paid: 0, aff1_paid: 0, aff2_paid: 0 }]);
  });
});

import { beforeEach, describe, expect, test } from "vitest";
import { q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { settlePending } from "./settlement";

describe.skipIf(!hasTestDb)("settling a discounted bill", () => {
  beforeEach(async () => {
    await resetDb();
    await run("DELETE FROM bills");
    await run("DELETE FROM rounds");
    await run("DELETE FROM lottos");
  });

  test("gives cashback on what the member actually lost", async () => {
    const lotto = (await run("INSERT INTO lottos (slug, name, short_name, grp, format, schedule, rates, limits, risk) VALUES ('d','d','d','foreign','standard','{}','{}','{}','{}')")).lastId;
    const round = (
      await run("INSERT INTO rounds (lotto_id, day_key, opens_at, closes_at, draw_at, status, result) VALUES (?, '1970-01-01', 1, 2, 3, 'resulted', ?)", lotto, JSON.stringify({ top3: "925", bottom2: "49" }))
    ).lastId;
    await run("INSERT INTO settings (`key`, `value`, updated_at) VALUES ('rewards', ?, 1) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)", JSON.stringify({ cashbackBp: 1000, aff1Bp: 0, aff2Bp: 0 }));
    const user = (await run("INSERT INTO users (password_hash, ref_code, created_at) VALUES ('x', 'DISC0001', 1)")).lastId;
    const bill = (await run("INSERT INTO bills (code, user_id, round_id, total_stake, discount, created_at) VALUES ('CPDISC0001', ?, ?, 8500, 1500, 1)", user, round)).lastId;
    await run("INSERT INTO bill_items (bill_id, round_id, bet_type, number, stake, discount, segments, rate100, potential) VALUES (?, ?, 'top2', '11', 100, 1500, '[]', 7500, 750000)", bill, round);
    await settlePending(round, 10);
    expect(await q1("SELECT cashback_balance FROM users WHERE id = ?", user)).toEqual({ cashback_balance: 850 });
  });
});

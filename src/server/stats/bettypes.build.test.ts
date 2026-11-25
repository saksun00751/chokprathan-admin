import { beforeEach, describe, expect, test } from "vitest";
import { run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { buildSpan } from "./build";

describe.skipIf(!hasTestDb)("bet-type days on MariaDB", () => {
  beforeEach(async () => {
    await resetDb();
    await run("DELETE FROM bills");
    await run("DELETE FROM rounds");
    await run("DELETE FROM lottos");
  });

  test("keep the discount of every item and of the settled ones", async () => {
    const lotto = (await run("INSERT INTO lottos (slug, name, short_name, grp, format, schedule, rates, limits, risk) VALUES ('bt','bt','bt','foreign','standard','{}','{}','{}','{}')")).lastId;
    const round = (await run("INSERT INTO rounds (lotto_id, day_key, opens_at, closes_at, draw_at) VALUES (?, '1970-01-01', 1, 2, 3)", lotto)).lastId;
    const user = (await run("INSERT INTO users (password_hash, ref_code, created_at) VALUES ('x', 'BTYPE001', 1)")).lastId;
    for (const [code, status] of [["CPBT1", "lost"], ["CPBT2", "pending"]]) {
      const bill = (await run("INSERT INTO bills (code, user_id, round_id, total_stake, discount, status, created_at) VALUES (?, ?, ?, 8500, 1500, ?, 1000)", code, user, round, status)).lastId;
      await run("INSERT INTO bill_items (bill_id, round_id, bet_type, number, stake, discount, segments, rate100, potential, status) VALUES (?, ?, 'top2', '25', 100, 1500, '[]', 7500, 750000, ?)", bill, round, status);
    }
    const span = await buildSpan(0, 0, 5000);
    expect(span.days[0].betTypes.top2).toMatchObject({ items: 2, stake: 200, discount: 3000, settled: 100, settledDiscount: 1500 });
  });
});

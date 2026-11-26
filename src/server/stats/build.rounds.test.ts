import { beforeEach, describe, expect, test } from "vitest";
import { run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { buildRounds } from "./build";

describe.skipIf(!hasTestDb)("round summaries", () => {
  beforeEach(async () => {
    await resetDb();
    await run("DELETE FROM rounds");
    await run("DELETE FROM lottos");
  });

  test("carry the scheduled close of a draw closed early, which names it in reports", async () => {
    const lotto = (
      await run(`INSERT INTO lottos (slug, name, short_name, grp, format, schedule, rates, limits, risk) VALUES ('s', 's', 's', 'foreign', 'standard', '{}', '{}', '{}', '{}')`)
    ).lastId;
    const id = (await run("INSERT INTO rounds (lotto_id, day_key, opens_at, closes_at, planned_close, draw_at) VALUES (?, '1970-01-01', 1, 2000, 5000, 6000)", lotto)).lastId;
    expect((await buildRounds([id]))[0]).toMatchObject({ closesAt: 2000, plannedClose: 5000 });
  });
});

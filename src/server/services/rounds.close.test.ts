import { beforeEach, describe, expect, test } from "vitest";
import { bkkMs } from "@/core/rules/time";
import { invalidate } from "@/server/cache";
import { q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { closeRoundNow, ensureRounds, getRound, roundLabel } from "./rounds";

const now = bkkMs(2026, 11, 4, 12, 0); // Wednesday
const planned = bkkMs(2026, 11, 4, 20, 0);

describe.skipIf(!hasTestDb)("closing a round early", () => {
  let id: number;
  beforeEach(async () => {
    await resetDb();
    await run("DELETE FROM rounds");
    await run("DELETE FROM lottos");
    await run(
      `INSERT INTO lottos (slug, name, short_name, grp, format, schedule, rates, limits, risk)
       VALUES ('e', 'e', 'e', 'foreign', 'standard', '{"kind":"weekly","days":[3],"close":"20:00"}', '{}', '{}', '{}')`,
    );
    invalidate("lottos");
    await ensureRounds(now, { daysBack: 0, daysAhead: 0 });
    id = (await q1<{ id: number }>("SELECT id FROM rounds WHERE closes_at = ?", planned))!.id;
  });

  test("stops betting now, remembers the planned time, and is not recreated", async () => {
    expect(await closeRoundNow(id, 1, now)).toEqual({ ok: true });
    expect(await q1("SELECT closes_at, planned_close, status FROM rounds WHERE id = ?", id)).toEqual({ closes_at: now, planned_close: planned, status: "scheduled" });
    expect(await ensureRounds(now, { daysBack: 0, daysAhead: 0 })).toBe(0);
  });

  test("does not rename the draw, even when closed days before", async () => {
    const before = roundLabel((await getRound(id))!);
    expect(await closeRoundNow(id, 1, now - 24 * 3_600_000)).toEqual({ ok: true });
    expect(roundLabel((await getRound(id))!)).toBe(before);
  });

  test("only an open round can be closed", async () => {
    expect(await closeRoundNow(id, 1, planned + 1)).toEqual({ ok: false, error: "notOpen" });
    expect(await closeRoundNow(999999, 1, now)).toEqual({ ok: false, error: "notFound" });
    await closeRoundNow(id, 1, now);
    expect(await closeRoundNow(id, 1, now)).toEqual({ ok: false, error: "notOpen" });
  });
});

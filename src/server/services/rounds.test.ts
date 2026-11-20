import { beforeEach, describe, expect, test } from "vitest";
import { bkkMs } from "@/domain/time";
import { json, q, q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { ensureRounds, phaseOf } from "./rounds";

const now = bkkMs(2026, 11, 4, 12, 0); // Wednesday

const addLotto = (slug: string, name: string, grp: string, format: string, schedule: unknown, delay: number) =>
  run(
    `INSERT INTO lottos (slug, name, short_name, grp, format, schedule, result_delay_min, rates, limits, risk)
     VALUES (?, ?, ?, ?, ?, ?, ?, '{}', '{}', '{}')`,
    slug,
    name,
    name,
    grp,
    format,
    json.str(schedule),
    delay,
  );

test("phaseOf follows the clock and the stored status", () => {
  const round = { opensAt: 100, closesAt: 200, status: "scheduled" as const };
  expect(phaseOf(round, 50)).toBe("upcoming");
  expect(phaseOf(round, 100)).toBe("open");
  expect(phaseOf(round, 200)).toBe("closed");
  expect(phaseOf({ ...round, status: "resulted" }, 300)).toBe("resulted");
  expect(phaseOf({ ...round, status: "cancelled" }, 150)).toBe("cancelled");
});

describe.skipIf(!hasTestDb)("ensureRounds on MariaDB", () => {
  beforeEach(async () => {
    await resetDb();
    await addLotto("yiki", "หวยยี่กี", "yiki", "standard", { kind: "interval", firstClose: "06:00", everyMin: 15, count: 88 }, 2);
    await addLotto("laos-pattana", "หวยลาวพัฒนา", "foreign", "laos4", { kind: "weekly", days: [1, 3, 5], close: "20:15" }, 25);
  });

  test("creates every Yiki round for the day once, numbered, opening at yesterday's last close", async () => {
    expect(await ensureRounds(now, { daysBack: 0, daysAhead: 0 })).toBe(89);
    expect(await ensureRounds(now, { daysBack: 0, daysAhead: 0 })).toBe(0);
    const rows = await q<{ round_no: number; opens_at: number; closes_at: number; draw_at: number }>(
      `SELECT round_no, opens_at, closes_at, draw_at FROM rounds r JOIN lottos l ON l.id = r.lotto_id
       WHERE l.slug = 'yiki' ORDER BY closes_at`,
    );
    expect(rows).toHaveLength(88);
    expect(rows[0]).toEqual({
      round_no: 1,
      opens_at: bkkMs(2026, 11, 4, 3, 45),
      closes_at: bkkMs(2026, 11, 4, 6, 0),
      draw_at: bkkMs(2026, 11, 4, 6, 2),
    });
    expect(rows[87].round_no).toBe(88);
    expect(rows.every((r) => r.opens_at === rows[0].opens_at)).toBe(true);
  });

  test("weekly rounds open when the previous draw closes", async () => {
    await ensureRounds(now, { daysBack: 0, daysAhead: 0 });
    const laos = await q1<{ opens_at: number; closes_at: number; day_key: string }>(
      `SELECT opens_at, closes_at, day_key FROM rounds r JOIN lottos l ON l.id = r.lotto_id WHERE l.slug = 'laos-pattana'`,
    );
    expect(laos).toEqual({
      opens_at: bkkMs(2026, 11, 2, 20, 15),
      closes_at: bkkMs(2026, 11, 4, 20, 15),
      day_key: "2026-11-04",
    });
  });

  test("a monthly draw weeks away is created so members can bet on it now", async () => {
    await addLotto("thai-gov", "หวยรัฐบาลไทย", "thai", "thai_gov", { kind: "monthly", days: [1, 16], close: "15:10" }, 50);
    await ensureRounds(now);
    const gov = await q1<{ opens_at: number; closes_at: number }>(
      `SELECT opens_at, closes_at FROM rounds r JOIN lottos l ON l.id = r.lotto_id WHERE l.slug = 'thai-gov' AND r.closes_at > ?`,
      now,
    );
    expect(gov).toEqual({ opens_at: bkkMs(2026, 11, 1, 15, 10), closes_at: bkkMs(2026, 11, 16, 15, 10) });
  });
});

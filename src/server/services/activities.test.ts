import { beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_ACTIVITIES } from "@/domain/activities";
import { json, q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { placeGuess, settleGuesses, spinWheel } from "./activities";
import { movePoints } from "./points";
import { setSetting } from "./settings";

const now = Date.UTC(2026, 10, 9, 5, 0);
let lottoId: number;
let roundId: number;

async function member(phone: string, points = 0) {
  const id = (
    await run("INSERT INTO users (phone, password_hash, name, ref_code, created_at) VALUES (?, 'x', 'ทดสอบ', ?, ?)", phone, `R${phone.slice(-6)}`, now)
  ).lastId;
  if (points > 0) await movePoints(id, points, "adjust", { note: "ทดสอบ", now });
  return id;
}

const balance = async (id: number) =>
  (await q1<{ balance: number; turnover_required: number }>("SELECT balance, turnover_required FROM users WHERE id = ?", id))!;
const points = async (id: number) => Number((await q1<{ points: number }>("SELECT points FROM member_points WHERE user_id = ?", id))?.points ?? 0);

describe.skipIf(!hasTestDb)("point activities on MariaDB", () => {
  beforeEach(async () => {
    await resetDb();
    lottoId = (
      await run(
        `INSERT INTO lottos (slug, name, short_name, grp, format, schedule, result_delay_min, rates, limits, risk)
         VALUES ('hanoi', 'หวยฮานอยปกติ', 'ฮานอยปกติ', 'foreign', 'standard', ?, 25, '{}', '{}', '{}')`,
        json.str({ kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], close: "18:05" }),
      )
    ).lastId;
    roundId = (
      await run(
        "INSERT INTO rounds (lotto_id, day_key, opens_at, closes_at, draw_at) VALUES (?, '2026-11-09', ?, ?, ?)",
        lottoId,
        now - 3_600_000,
        now + 3_600_000,
        now + 5_400_000,
      )
    ).lastId;
  });

  test("a spin takes its points, pays the drawn prize with turnover, and respects the daily limit", async () => {
    // One slot only pays, so the draw is certain.
    await setSetting(
      "activities",
      {
        ...DEFAULT_ACTIVITIES,
        wheel: {
          ...DEFAULT_ACTIVITIES.wheel,
          enabled: true,
          dailyLimit: 1,
          turnoverX: 2,
          prizes: [
            { amount: 0, chance: 0 },
            { amount: 50_00, chance: 10_000 },
          ],
        },
      },
      now,
    );
    const id = await member("0811111111", 25);
    const r = await spinWheel(id, now);
    expect(r).toMatchObject({ ok: true, slot: 1, prize: 50_00, points: 15, spinsLeft: 0 });
    expect(await balance(id)).toEqual({ balance: 50_00, turnover_required: 100_00 });
    expect(await spinWheel(id, now + 1000)).toEqual({ ok: false, error: "limit" });
    expect(await points(id)).toBe(15);
  });

  test("without enough points nothing happens", async () => {
    await setSetting("activities", { ...DEFAULT_ACTIVITIES, wheel: { ...DEFAULT_ACTIVITIES.wheel, enabled: true } }, now);
    const id = await member("0822222222", 3);
    expect(await spinWheel(id, now)).toEqual({ ok: false, error: "points" });
    expect(await points(id)).toBe(3);
  });

  test("guesses: the right number wins when the result comes in, the rest lose; a number is taken once", async () => {
    await setSetting("activities", { ...DEFAULT_ACTIVITIES, guess: { ...DEFAULT_ACTIVITIES.guess, enabled: true, lottoIds: [lottoId] } }, now);
    const a = await member("0833333333", 20);
    const b = await member("0844444444", 20);
    expect((await placeGuess(a, roundId, "25", now)).ok).toBe(true);
    expect(await placeGuess(a, roundId, "25", now)).toEqual({ ok: false, error: "taken" });
    expect((await placeGuess(b, roundId, "52", now)).ok).toBe(true);
    await run("UPDATE rounds SET status = 'resulted', result = ? WHERE id = ?", json.str({ top3: "125", bottom2: "25" }), roundId);
    expect(await settleGuesses(roundId, now)).toBe(2);
    expect((await balance(a)).balance).toBe(300_00);
    expect((await balance(b)).balance).toBe(0);
    expect(await settleGuesses(roundId, now)).toBe(0);
  });

  test("a cancelled round gives the points back", async () => {
    await setSetting("activities", { ...DEFAULT_ACTIVITIES, guess: { ...DEFAULT_ACTIVITIES.guess, enabled: true, lottoIds: [lottoId] } }, now);
    const a = await member("0855555555", 10);
    await placeGuess(a, roundId, "07", now);
    expect(await points(a)).toBe(5);
    await run("UPDATE rounds SET status = 'cancelled' WHERE id = ?", roundId);
    await settleGuesses(roundId, now);
    expect(await points(a)).toBe(10);
  });
});

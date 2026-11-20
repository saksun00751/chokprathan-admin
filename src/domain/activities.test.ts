import { describe, expect, test } from "vitest";
import { DEFAULT_ACTIVITIES, affordableSlot, guessPayout, guessProblem, pickPrize, returnShare, wheelAverage, wheelProblem } from "./activities";
import { DEFAULT_POINT_RULE } from "./points";

const wheel = DEFAULT_ACTIVITIES.wheel;

describe("the lucky wheel", () => {
  test("a roll from 0 to 9,999 lands on the slot its chance covers", () => {
    const prizes = [
      { amount: 0, chance: 3000 },
      { amount: 5_00, chance: 7000 },
    ];
    expect(pickPrize(prizes, 0)).toBe(0);
    expect(pickPrize(prizes, 2999)).toBe(0);
    expect(pickPrize(prizes, 3000)).toBe(1);
    expect(pickPrize(prizes, 9999)).toBe(1);
  });

  test("the recommended prizes pay about ฿10.55 a spin, about 1% of the deposits that earned the points", () => {
    expect(wheelAverage(wheel.prizes)).toBe(10_55);
    expect(returnShare(wheelAverage(wheel.prizes), wheel.cost, DEFAULT_POINT_RULE)).toBeCloseTo(0.01055, 5);
  });

  test("once the day's budget runs low, a big prize drops to the largest one still affordable", () => {
    expect(affordableSlot(wheel.prizes, 6, null)).toBe(6);
    expect(affordableSlot(wheel.prizes, 6, 60_00)).toBe(4);
    expect(affordableSlot(wheel.prizes, 3, 3_00)).toBe(0);
  });

  test("settings: chances must add up to exactly 100%, with 2 to 12 slots", () => {
    expect(wheelProblem(wheel)).toBeNull();
    expect(wheelProblem({ ...wheel, prizes: wheel.prizes.slice(1) })).toBe("chances");
    expect(wheelProblem({ ...wheel, prizes: [{ amount: 5_00, chance: 10_000 }] })).toBe("prizes");
    expect(wheelProblem({ ...wheel, cost: 0 })).toBe("cost");
  });
});

describe("guess the bottom two digits", () => {
  test("every winner gets the prize, unless that would pass the round budget: then they split it", () => {
    expect(guessPayout(300_00, 3, 0)).toBe(300_00);
    expect(guessPayout(300_00, 3, 1_000_00)).toBe(300_00);
    expect(guessPayout(300_00, 10, 1_000_00)).toBe(100_00);
    expect(guessPayout(300_00, 0, 1_000_00)).toBe(0);
  });

  test("settings: switched on needs at least one lottery to guess on", () => {
    expect(guessProblem({ ...DEFAULT_ACTIVITIES.guess, enabled: true, lottoIds: [] })).toBe("lottos");
    expect(guessProblem({ ...DEFAULT_ACTIVITIES.guess, enabled: true, lottoIds: [3] })).toBeNull();
    expect(guessProblem({ ...DEFAULT_ACTIVITIES.guess, prize: 0 })).toBe("prize");
  });
});

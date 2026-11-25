import { describe, expect, test } from "vitest";
import { betTypeFigures, emptyDay, sumBetTypes } from "./derive";

describe("bet-type figures", () => {
  test("count the money paid, with the average rate on the stake before discount", () => {
    const day = { ...emptyDay(1, 0), betTypes: { top2: { items: 1, won: 0, stake: 100, potential: 750_000, payout: 0, settled: 100, discount: 1500, settledDiscount: 1500 } } };
    expect(betTypeFigures(sumBetTypes([day]).top2)).toEqual({ turnover: 8500, ggr: 8500, avgRate: 75 });
  });

  test("a stored day from before discounts gives the old figures", () => {
    const day = { ...emptyDay(1, 0), betTypes: { top2: { items: 3, won: 1, stake: 30, potential: 270_000, payout: 900, settled: 20 } } };
    expect(betTypeFigures(sumBetTypes([day]).top2)).toEqual({ turnover: 3000, ggr: 1100, avgRate: 90 });
  });

  test("have no average without a stake", () => {
    expect(betTypeFigures({ items: 0, won: 0, stake: 0, potential: 0, payout: 0, settled: 0 }).avgRate).toBeNull();
  });
});

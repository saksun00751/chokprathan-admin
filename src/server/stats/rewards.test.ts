import { describe, expect, test } from "vitest";
import { emptyDay, rewardsEarned } from "./derive";

describe("rewards earned", () => {
  test("nets a correction that had to be taken from the main wallet", () => {
    const day = { ...emptyDay(1, 0), tx: { "cashback:cashback_earn": 100_00, "balance:cashback_correction": -100_00, "affiliate:aff_earn": 50_00, "affiliate:aff_correction": -10_00, "balance:aff_correction": -5_00, "balance:cashback_claim": 100_00 } };
    expect(rewardsEarned([day])).toEqual({ cashback: 0, affiliate: 35_00 });
  });
});

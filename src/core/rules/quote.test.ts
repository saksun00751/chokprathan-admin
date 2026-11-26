import { describe, expect, it } from "vitest";
import { betRules, priceSlip, slipKey, type PriceSlipInput } from "./quote";
import type { RoundConfig } from "./roundConfig";

const off = { enabled: false, tiers: [], cap: null };
const config: RoundConfig = {
  format: "standard",
  maxPerBill: 1000,
  maxLines: 3,
  betTypes: {
    top2: { minStake: 5, maxPerNumber: 300, risk: { enabled: true, tiers: [{ threshold: 100, percent: 50 }], cap: 500 } },
    top3: { minStake: 1, maxPerNumber: 300, risk: off },
  },
  packages: [
    { id: 1, code: "standard", name: "A", rates: { top2: { rate100: 9000, discountBp: 0 }, top3: { rate100: 90000, discountBp: 0 } } },
    { id: 2, code: "discount", name: "B", rates: { top2: { rate100: 7500, discountBp: 1500 } } },
  ],
};
const price = (lines: PriceSlipInput["lines"], over: Partial<PriceSlipInput> = {}) =>
  priceSlip({ config, lines, manual: new Map(), totals: new Map(), held: new Map(), ...over });
const line = (stake: number, number = "25", betType: "top2" | "top3" = "top2") => ({ betType, number, stake });

describe("betRules", () => {
  it("lists what a package offers, the first package by default", () => {
    expect(betRules(config).map((r) => [r.code, r.rate100, r.discountBp])).toEqual([["top3", 90000, 0], ["top2", 9000, 0]]);
    expect(betRules(config, 2).map((r) => r.code)).toEqual(["top2"]);
    expect(betRules(config, 9)).toEqual([]);
  });
});

describe("priceSlip", () => {
  it("takes the discount off the money paid, not off the winnings", () => {
    const q = price([line(100)], { packageId: 2 });
    expect(q).toMatchObject({ ok: true, packageId: 2, totalStake: 100, totalDiscount: 1500, totalNet: 8500 });
    expect(q.lines[0]).toMatchObject({ ok: true, discount: 1500, net: 8500, potential: 100 * 7500 });
  });
  it("cuts the package's own rate when the number is busy, keeping the discount", () => {
    const q = price([line(100)], { packageId: 2, totals: new Map([[slipKey("top2", "25"), 100]]) });
    expect(q.lines[0]).toMatchObject({ ok: true, rate100: 3750, discount: 1500, reduced: true });
  });
  it("counts what the member already holds on the number against the limit", () => {
    const held = new Map([[slipKey("top2", "25"), 250]]);
    expect(price([line(60)], { held }).lines[0]).toMatchObject({ ok: false, reason: "max", limit: 300 });
    expect(price([line(50)], { held }).ok).toBe(true);
  });
  it("adds lines on one number together, for the limit and for the tiers", () => {
    const q = price([line(100), line(100), line(150)]);
    expect(q.lines[1]).toMatchObject({ ok: true, rate100: 4500 });
    expect(q.lines[2]).toMatchObject({ ok: false, reason: "max" });
  });
  it("names why a line is refused", () => {
    expect(price([line(100, "255", "top2")]).lines[0]).toMatchObject({ ok: false, reason: "invalid" });
    expect(price([line(100, "255", "top3")], { packageId: 2 }).lines[0]).toMatchObject({ ok: false, reason: "unavailable" });
    expect(price([line(4)]).lines[0]).toMatchObject({ ok: false, reason: "min", limit: 5 });
    expect(price([line(10)], { manual: new Map([[slipKey("top2", "25"), { kind: "closed" as const }]]) }).lines[0]).toMatchObject({ ok: false, reason: "closed" });
    expect(price([line(200)], { totals: new Map([[slipKey("top2", "25"), 400]]) }).lines[0]).toMatchObject({ ok: false, reason: "cap", remaining: 100 });
  });
  it("refuses the whole slip when it is empty, too long, too big or for an unknown package", () => {
    expect(price([]).error).toBe("empty");
    expect(price([line(5), line(5), line(5), line(5)]).error).toBe("too_many_lines");
    expect(price([line(10)], { packageId: 9 }).error).toBe("package");
    const big = price([line(300, "11"), line(300, "22"), line(401, "123", "top3")]);
    expect(big).toMatchObject({ ok: false, error: "over_bill_limit", totalStake: 1001 });
  });
  it("totals only accepted lines in the discount and net", () => {
    const q = price([line(100), line(1, "11")], { packageId: 2 });
    expect(q).toMatchObject({ ok: false, totalStake: 101, totalDiscount: 1500, totalNet: 8500 });
  });
});

describe("the per-number limit when refused", () => {
  const over = (stake: number, held: number, before: number[] = []) =>
    price([...before.map((s) => line(s)), line(stake)], { held: new Map([[slipKey("top2", "25"), held]]) }).lines.at(-1);

  it("says how much more the member can put on the number", () => {
    expect(over(60, 250)).toMatchObject({ reason: "max", limit: 300, remaining: 50 });
    expect(over(100, 150, [100])).toMatchObject({ reason: "max", remaining: 50 });
  });

  it("never says less than nothing", () => {
    expect(over(10, 400)).toMatchObject({ reason: "max", remaining: 0 });
  });
});

import { describe, expect, it } from "vitest";
import { buildRoundConfig, discountOf, netOf, type RoundConfigInput } from "./roundConfig";

const risk = { enabled: false, tiers: [], cap: null };
const bet = (code: "top3" | "top2" | "top4", enabled = true) => ({ code, enabled, minStake: 1, maxPerNumber: 100, risk });
const input = (over: Partial<RoundConfigInput> = {}): RoundConfigInput => ({
  format: "standard",
  maxPerBill: 5000,
  maxLines: 50,
  betTypes: [bet("top2"), bet("top3")],
  packages: [{ id: 1, code: "standard", name: "มาตรฐาน", sort: 0, rates: { top3: { rate100: 90000, discountBp: 0 }, top2: { rate100: 9000, discountBp: 0 } }, overrides: {} }],
  ...over,
});

describe("discount", () => {
  it("is floored to whole satang", () => {
    expect(discountOf(100, 1500)).toBe(1500);
    expect(discountOf(1, 1550)).toBe(15);
    expect(discountOf(3, 33)).toBe(0);
    expect(netOf(100, 1500)).toBe(8500);
  });
  it("net plus discount is always the stake", () => {
    for (const stake of [1, 7, 99, 12345]) for (const bp of [0, 1, 1550, 9999]) expect(netOf(stake, bp) + discountOf(stake, bp)).toBe(stake * 100);
  });
  it("refuses a bad stake or discount", () => {
    expect(() => discountOf(0, 0)).toThrow(RangeError);
    expect(() => discountOf(1.5, 0)).toThrow(RangeError);
    expect(() => discountOf(1, 10_000)).toThrow(RangeError);
    expect(() => discountOf(1, -1)).toThrow(RangeError);
  });
});

describe("buildRoundConfig", () => {
  it("keeps bet types in the standard order, whatever order they arrive in", () => {
    const r = buildRoundConfig(input());
    expect(r.ok && Object.keys(r.config.betTypes)).toEqual(["top3", "top2"]);
    expect(r.ok && Object.keys(r.config.packages[0].rates)).toEqual(["top3", "top2"]);
  });
  it("drops disabled bet types and ones the result format cannot draw", () => {
    const r = buildRoundConfig(input({ betTypes: [bet("top3"), bet("top2", false), bet("top4")] }));
    expect(r.ok && Object.keys(r.config.betTypes)).toEqual(["top3"]);
  });
  it("lets a lottery override one field and inherit the other", () => {
    const r = buildRoundConfig(
      input({
        packages: [
          { id: 1, code: "a", name: "A", sort: 0, rates: { top3: { rate100: 90000, discountBp: 1000 } }, overrides: { top3: { rate100: 80000, discountBp: null } } },
        ],
      }),
    );
    expect(r.ok && r.config.packages[0].rates.top3).toEqual({ rate100: 80000, discountBp: 1000 });
  });
  it("does not offer a bet type the package has no rate for, nor an empty package", () => {
    const r = buildRoundConfig(
      input({
        packages: [
          { id: 2, code: "b", name: "B", sort: 5, rates: {}, overrides: {} },
          { id: 1, code: "a", name: "A", sort: 1, rates: { top2: { rate100: 9000, discountBp: 0 } }, overrides: { top3: { rate100: 1, discountBp: null } } },
        ],
      }),
    );
    expect(r.ok && r.config.packages.map((p) => p.code)).toEqual(["a"]);
    expect(r.ok && Object.keys(r.config.packages[0].rates)).toEqual(["top2"]);
  });
  it("orders packages by sort, then id", () => {
    const rates = { top3: { rate100: 1, discountBp: 0 } };
    const p = (id: number, sort: number) => ({ id, code: `p${id}`, name: "x", sort, rates, overrides: {} });
    const r = buildRoundConfig(input({ packages: [p(3, 1), p(2, 1), p(9, 0)] }));
    expect(r.ok && r.config.packages.map((x) => x.id)).toEqual([9, 2, 3]);
  });
  it("reports why nothing can be offered", () => {
    expect(buildRoundConfig(input({ betTypes: [] }))).toEqual({ ok: false, error: "noBetTypes" });
    expect(buildRoundConfig(input({ packages: [] }))).toEqual({ ok: false, error: "noPackages" });
  });
  it("refuses a rate or discount out of range", () => {
    const bad = (rate100: number, discountBp: number) =>
      buildRoundConfig(input({ packages: [{ id: 1, code: "a", name: "A", sort: 0, rates: { top3: { rate100, discountBp } }, overrides: {} }] }));
    expect(bad(0, 0)).toEqual({ ok: false, error: "badRate" });
    expect(bad(1.5, 0)).toEqual({ ok: false, error: "badRate" });
    expect(bad(100, 10_000)).toEqual({ ok: false, error: "badRate" });
  });
});

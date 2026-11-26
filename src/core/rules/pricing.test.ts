import { describe, expect, test } from "vitest";
import { marginalRate100, priceStake, validateProfile } from "./pricing";
import type { RiskProfile } from "./types";

const base = 95000; // 3 ตัวบน ×950
const profile: RiskProfile = {
  enabled: true,
  tiers: [
    { threshold: 2000, percent: 75 },
    { threshold: 5000, percent: 50 },
  ],
  cap: 10000,
};
const price = (currentTotal: number, stake: number, overrides: Partial<Parameters<typeof priceStake>[0]> = {}) =>
  priceStake({ baseRate100: base, profile, manual: null, currentTotal, stake, ...overrides });

describe("priceStake splits a stake across tiers", () => {
  test("below the first threshold pays the base rate", () => {
    expect(price(0, 100)).toEqual({ ok: true, segments: [{ stake: 100, rate100: 95000 }] });
  });
  test("crossing the first threshold splits at it", () => {
    expect(price(1800, 500)).toEqual({
      ok: true,
      segments: [
        { stake: 200, rate100: 95000 },
        { stake: 300, rate100: 71250 },
      ],
    });
  });
  test("crossing the second threshold", () => {
    expect(price(4900, 200)).toEqual({
      ok: true,
      segments: [
        { stake: 100, rate100: 71250 },
        { stake: 100, rate100: 47500 },
      ],
    });
  });
  test("one stake can span every tier", () => {
    expect(price(1500, 4000)).toEqual({
      ok: true,
      segments: [
        { stake: 500, rate100: 95000 },
        { stake: 3000, rate100: 71250 },
        { stake: 500, rate100: 47500 },
      ],
    });
  });
  test("a total exactly at a threshold is already reduced", () => {
    expect(price(2000, 100)).toEqual({ ok: true, segments: [{ stake: 100, rate100: 71250 }] });
  });
});

describe("cap", () => {
  test("a stake that would pass the cap is rejected with the remaining room", () => {
    expect(price(9900, 200)).toEqual({ ok: false, reason: "cap", remaining: 100 });
  });
  test("a stake that lands exactly on the cap is accepted", () => {
    expect(price(9900, 100)).toEqual({ ok: true, segments: [{ stake: 100, rate100: 47500 }] });
  });
  test("a number already at the cap accepts nothing", () => {
    expect(price(10000, 1)).toEqual({ ok: false, reason: "cap", remaining: 0 });
  });
  test("no cap keeps accepting at the last tier", () => {
    expect(price(50000, 100, { profile: { ...profile, cap: null } })).toEqual({
      ok: true,
      segments: [{ stake: 100, rate100: 47500 }],
    });
  });
});

describe("manual limits (อั้นเลข)", () => {
  test("a manual percent caps the rate", () => {
    expect(price(0, 100, { manual: { kind: "percent", percent: 60 } })).toEqual({
      ok: true,
      segments: [{ stake: 100, rate100: 57000 }],
    });
  });
  test("a manual percent only lowers, never raises, a tier rate", () => {
    expect(price(4900, 200, { manual: { kind: "percent", percent: 60 } })).toEqual({
      ok: true,
      segments: [
        { stake: 100, rate100: 57000 },
        { stake: 100, rate100: 47500 },
      ],
    });
  });
  test("adjacent slices at the same rate merge", () => {
    expect(price(1800, 500, { manual: { kind: "percent", percent: 40 } })).toEqual({
      ok: true,
      segments: [{ stake: 500, rate100: 38000 }],
    });
  });
  test("a closed number rejects everything", () => {
    expect(price(0, 10, { manual: { kind: "closed" } })).toEqual({ ok: false, reason: "closed", remaining: 0 });
  });
});

describe("disabled profile and rounding", () => {
  test("a disabled profile pays the base rate with no cap", () => {
    expect(price(9900, 5000, { profile: { ...profile, enabled: false } })).toEqual({
      ok: true,
      segments: [{ stake: 5000, rate100: 95000 }],
    });
  });
  test("reduced rates round down to a whole rate100", () => {
    const run: RiskProfile = { enabled: true, tiers: [{ threshold: 10, percent: 33 }], cap: null };
    expect(priceStake({ baseRate100: 320, profile: run, manual: null, currentTotal: 10, stake: 5 })).toEqual({
      ok: true,
      segments: [{ stake: 5, rate100: 105 }],
    });
  });
  test("stake must be a positive whole number of baht", () => {
    expect(() => price(0, 0)).toThrow(RangeError);
    expect(() => price(0, 1.5)).toThrow(RangeError);
    expect(() => price(-1, 10)).toThrow(RangeError);
  });
});

describe("marginalRate100 (rate for the next baht)", () => {
  test("follows the tiers and closes at the cap", () => {
    expect(marginalRate100(base, profile, null, 0)).toBe(95000);
    expect(marginalRate100(base, profile, null, 2000)).toBe(71250);
    expect(marginalRate100(base, profile, null, 9999)).toBe(47500);
    expect(marginalRate100(base, profile, null, 10000)).toBeNull();
  });
  test("respects manual limits", () => {
    expect(marginalRate100(base, profile, { kind: "closed" }, 0)).toBeNull();
    expect(marginalRate100(base, profile, { kind: "percent", percent: 60 }, 0)).toBe(57000);
  });
});

describe("validateProfile", () => {
  test("the spec defaults are valid", () => {
    expect(validateProfile(profile)).toEqual([]);
  });
  test("tiers must ascend by threshold with strictly falling percents between 1 and 99", () => {
    expect(
      validateProfile({ enabled: true, tiers: [{ threshold: 5000, percent: 50 }, { threshold: 2000, percent: 75 }], cap: null }),
    ).not.toEqual([]);
    expect(validateProfile({ enabled: true, tiers: [{ threshold: 1000, percent: 100 }], cap: null })).not.toEqual([]);
    expect(
      validateProfile({ enabled: true, tiers: [{ threshold: 1000, percent: 70 }, { threshold: 2000, percent: 80 }], cap: null }),
    ).not.toEqual([]);
  });
  test("the cap must be above the last threshold", () => {
    expect(validateProfile({ ...profile, cap: 4000 })).not.toEqual([]);
  });
});

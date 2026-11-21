import { describe, expect, test } from "vitest";
import { priceStake } from "@/domain/pricing";
import type { RiskProfile } from "@/domain/types";
import { defaultsSummary, equalsDefaults, exampleTotal, explainProfile, percentRate100, sampleNumber } from "./risk-explain";

const TOP2: RiskProfile = { enabled: true, tiers: [{ threshold: 5000, percent: 75 }, { threshold: 15000, percent: 50 }], cap: 30000 };
const num = (n: number) => n.toLocaleString("en-US");

describe("explainProfile", () => {
  test("disabled profile: one line, base rate, no example", () => {
    expect(explainProfile({ ...TOP2, enabled: false }, 9500, "top2")).toEqual({ rows: [{ kind: "off", rate100: 9500 }], example: null });
  });

  test("enabled with no steps and no cap never changes", () => {
    expect(explainProfile({ enabled: true, tiers: [], cap: null }, 9500)).toEqual({ rows: [{ kind: "flat", rate100: 9500 }], example: null });
  });

  test("no tiers + cap: start runs up to the cap, example is the closed one", () => {
    expect(explainProfile({ enabled: true, tiers: [], cap: 8000 }, 15000, "tod3")).toEqual({
      rows: [
        { kind: "start", to: 8000, rate100: 15000 },
        { kind: "close", from: 8000 },
      ],
      example: { kind: "closed", sample: "123", total: 8000 },
    });
  });

  test("one tier + cap: example halfway to the cap, rounded to 100", () => {
    const e = explainProfile({ enabled: true, tiers: [{ threshold: 500, percent: 70 }], cap: 1000 }, 600000, "top4");
    expect(e.rows).toEqual([
      { kind: "start", to: 500, rate100: 600000 },
      { kind: "tier", from: 500, percent: 70, rate100: 420000 },
      { kind: "close", from: 1000 },
    ]);
    expect(e.example).toEqual({ kind: "rate", sample: "1234", total: 800, rate100: 420000 });
  });

  test("two tiers + cap (2 top digits, system defaults)", () => {
    const e = explainProfile(TOP2, 9500, "top2");
    expect(e.rows).toEqual([
      { kind: "start", to: 5000, rate100: 9500 },
      { kind: "tier", from: 5000, percent: 75, rate100: 7125 },
      { kind: "tier", from: 15000, percent: 50, rate100: 4750 },
      { kind: "close", from: 30000 },
    ]);
    expect(e.example).toEqual({ kind: "rate", sample: "47", total: 10000, rate100: 7125 });
  });

  test("tiers without a cap: example at 1.5 times the only threshold's midpoint", () => {
    const e = explainProfile({ enabled: true, tiers: [{ threshold: 20000, percent: 80 }], cap: null }, 320, "runTop");
    expect(e.rows).toEqual([
      { kind: "start", to: 20000, rate100: 320 },
      { kind: "tier", from: 20000, percent: 80, rate100: 256 },
    ]);
    expect(e.example).toEqual({ kind: "rate", sample: "5", total: 25000, rate100: 256 });
  });

  test("odd base rate rounds down exactly like the pricing", () => {
    const profile: RiskProfile = { enabled: true, tiers: [{ threshold: 100, percent: 75 }], cap: null };
    const e = explainProfile(profile, 9050);
    const priced = priceStake({ baseRate100: 9050, profile, manual: null, currentTotal: 100, stake: 1 });
    expect(priced).toEqual({ ok: true, segments: [{ stake: 1, rate100: 6787 }] });
    expect(e.rows[1]).toEqual({ kind: "tier", from: 100, percent: 75, rate100: 6787 });
    expect(percentRate100(9050, 75)).toBe(6787);
    expect(percentRate100(9050, 100)).toBe(9050);
  });

  test("the example total lies strictly between the first threshold and the next", () => {
    for (const [a, b] of [[5000, 15000], [500, 1000], [100, 200], [100, 130], [10, 13]] as const) {
      const t = exampleTotal(a, b);
      expect(t).toBeGreaterThan(a);
      expect(t).toBeLessThan(b);
    }
    expect(exampleTotal(100, 200)).toBe(150);
    expect(exampleTotal(100, 101)).toBe(100);
  });

  test("invalid or unsorted tiers do not crash", () => {
    const bad: RiskProfile = { enabled: true, tiers: [{ threshold: 15000, percent: 50 }, { threshold: 5000, percent: 75 }, { threshold: 0, percent: 0 }], cap: 3000 };
    const e = explainProfile(bad, 9500, "top2");
    expect(e.rows[0]).toMatchObject({ kind: "start", to: 0 });
    expect(e.rows).toHaveLength(5);
    expect(e.example).not.toBeNull();
    expect(() => explainProfile({ enabled: true, tiers: [{ threshold: Number.NaN, percent: 75 }], cap: null }, 0)).not.toThrow();
  });

  test("the sample number has the bet type's digits", () => {
    expect([sampleNumber("runTop"), sampleNumber("top2"), sampleNumber("top3"), sampleNumber("top4"), sampleNumber()]).toEqual(["5", "47", "123", "1234", "47"]);
  });
});

describe("defaults", () => {
  const defaults = { rate100: 9500, maxPerNumber: 2000, profile: TOP2 };

  test("equalsDefaults compares by value", () => {
    expect(equalsDefaults({ rate100: 9500, maxPerNumber: 2000, profile: structuredClone(TOP2) }, defaults)).toBe(true);
    expect(equalsDefaults({ ...defaults, rate100: 9000 }, defaults)).toBe(false);
    expect(equalsDefaults({ ...defaults, maxPerNumber: 1000 }, defaults)).toBe(false);
    expect(equalsDefaults({ ...defaults, profile: { ...TOP2, cap: null } }, defaults)).toBe(false);
    expect(equalsDefaults({ ...defaults, profile: { ...TOP2, enabled: false } }, defaults)).toBe(false);
    expect(equalsDefaults({ ...defaults, profile: { ...TOP2, tiers: TOP2.tiers.slice(0, 1) } }, defaults)).toBe(false);
    expect(equalsDefaults({ ...defaults, profile: { ...TOP2, tiers: [TOP2.tiers[0], { threshold: 15000, percent: 40 }] } }, defaults)).toBe(false);
  });

  const m = { summary: "จ่ายบาทละ {rate} · สูงสุดต่อเลขต่อโพย {max} บาท · {tiers}", tiers: "ลดที่ {list}", close: "หยุดรับที่ {cap}", off: "ไม่ลดอัตรา" };

  test("summary lists the steps and the cap", () => {
    expect(defaultsSummary(defaults, m, num)).toBe("จ่ายบาทละ 95 · สูงสุดต่อเลขต่อโพย 2,000 บาท · ลดที่ 5,000 / 15,000 · หยุดรับที่ 30,000");
  });

  test("summary of a disabled or empty profile says it does not cut", () => {
    expect(defaultsSummary({ rate100: 320, maxPerNumber: 5000, profile: { ...TOP2, enabled: false } }, m, num)).toBe("จ่ายบาทละ 3.2 · สูงสุดต่อเลขต่อโพย 5,000 บาท · ไม่ลดอัตรา");
    expect(defaultsSummary({ rate100: 320, maxPerNumber: 5000, profile: { enabled: true, tiers: [], cap: null } }, m, num)).toBe("จ่ายบาทละ 3.2 · สูงสุดต่อเลขต่อโพย 5,000 บาท · ไม่ลดอัตรา");
    expect(defaultsSummary({ rate100: 320, maxPerNumber: 5000, profile: { enabled: true, tiers: [], cap: 9000 } }, m, num)).toBe("จ่ายบาทละ 3.2 · สูงสุดต่อเลขต่อโพย 5,000 บาท · หยุดรับที่ 9,000");
  });
});

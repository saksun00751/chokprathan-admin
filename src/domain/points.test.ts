import { describe, expect, test } from "vitest";
import { DEFAULT_POINT_RULE, pointRuleProblem, pointsAdjustProblem, pointsFor } from "./points";

describe("points earned from money coming in", () => {
  test("the default rule gives 1 point for every ฿100, counted per deposit and rounded down", () => {
    expect(pointsFor(100_00, DEFAULT_POINT_RULE)).toBe(1);
    expect(pointsFor(150_00, DEFAULT_POINT_RULE)).toBe(1);
    expect(pointsFor(99_99, DEFAULT_POINT_RULE)).toBe(0);
    expect(pointsFor(1_000_00, DEFAULT_POINT_RULE)).toBe(10);
  });

  test("the back office sets both sides of the rule: deposit ฿xxx, get x points", () => {
    expect(pointsFor(175_00, { enabled: true, every: 50_00, points: 2 })).toBe(6);
    expect(pointsFor(1_000_00, { enabled: true, every: 1_000_00, points: 15 })).toBe(15);
  });

  test("nothing is earned when the system is off or nothing came in", () => {
    expect(pointsFor(1_000_00, { ...DEFAULT_POINT_RULE, enabled: false })).toBe(0);
    expect(pointsFor(0, DEFAULT_POINT_RULE)).toBe(0);
    expect(pointsFor(-500_00, DEFAULT_POINT_RULE)).toBe(0);
  });
});

describe("rules the settings page accepts", () => {
  test("deposit from ฿1 to ฿1,000,000 per step, 1 to 1,000,000 points per step, whole numbers", () => {
    expect(pointRuleProblem(DEFAULT_POINT_RULE)).toBeNull();
    expect(pointRuleProblem({ enabled: true, every: 0, points: 1 })).toBe("every");
    expect(pointRuleProblem({ enabled: true, every: 1_000_000_01, points: 1 })).toBe("every");
    expect(pointRuleProblem({ enabled: true, every: 100_00, points: 0 })).toBe("points");
    expect(pointRuleProblem({ enabled: true, every: 100_00, points: 1.5 })).toBe("points");
  });
});

describe("staff adding or deducting points", () => {
  test("a whole, non-zero number of points up to a million either way", () => {
    expect(pointsAdjustProblem(10)).toBeNull();
    expect(pointsAdjustProblem(-5)).toBeNull();
    expect(pointsAdjustProblem(0)).toBe("zero");
    expect(pointsAdjustProblem(2.5)).toBe("invalid");
    expect(pointsAdjustProblem(Number.NaN)).toBe("invalid");
    expect(pointsAdjustProblem(1_000_001)).toBe("max");
  });
});

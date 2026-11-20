import { expect, test } from "vitest";
import { adjustLimitError, DEFAULT_ADJUST_LIMITS } from "./adjust";

const limits = { adjustMin: 100, adjustMax: 100_000_00 };

test("zero is never a valid adjustment", () => {
  expect(adjustLimitError(0, limits)).toBe("zero");
});

test("amounts below the minimum are refused in both directions", () => {
  expect(adjustLimitError(99, limits)).toBe("min");
  expect(adjustLimitError(-99, limits)).toBe("min");
  expect(adjustLimitError(100, limits)).toBeNull();
});

test("exactly the maximum passes and one satang more does not, adding or deducting", () => {
  expect(adjustLimitError(100_000_00, limits)).toBeNull();
  expect(adjustLimitError(-100_000_00, limits)).toBeNull();
  expect(adjustLimitError(100_000_01, limits)).toBe("max");
  expect(adjustLimitError(-100_000_01, limits)).toBe("max");
});

test("defaults are 1 baht to 100,000 baht", () => {
  expect(DEFAULT_ADJUST_LIMITS).toEqual({ adjustMin: 1_00, adjustMax: 100_000_00 });
});

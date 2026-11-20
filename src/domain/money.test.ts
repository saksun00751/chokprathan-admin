import { describe, expect, test } from "vitest";
import { averageRate100, formatBaht, formatCompactBaht, formatRate, payoutOf } from "./money";

describe("formatBaht", () => {
  test("always shows two decimals by default", () => {
    expect(formatBaht(500000)).toBe("5,000.00");
    expect(formatBaht(500037)).toBe("5,000.37");
    expect(formatBaht(-1234)).toBe("-12.34");
    expect(formatBaht(0)).toBe("0.00");
  });
  test("auto drops .00 on whole baht", () => {
    expect(formatBaht(500000, { decimals: "auto" })).toBe("5,000");
    expect(formatBaht(500037, { decimals: "auto" })).toBe("5,000.37");
  });
  test("sign adds a plus to positive amounts", () => {
    expect(formatBaht(1500, { sign: true })).toBe("+15.00");
    expect(formatBaht(-1500, { sign: true })).toBe("-15.00");
  });
});

describe("rates and payouts", () => {
  test("formatRate trims trailing zeros", () => {
    expect(formatRate(95000)).toBe("950");
    expect(formatRate(320)).toBe("3.2");
    expect(formatRate(71250)).toBe("712.5");
    expect(formatRate(47500)).toBe("475");
  });
  test("payoutOf sums stake × rate100 in satang", () => {
    expect(
      payoutOf([
        { stake: 200, rate100: 95000 },
        { stake: 300, rate100: 71250 },
      ]),
    ).toBe(40_375_000);
  });
  test("averageRate100 is the stake-weighted rate, rounded down", () => {
    expect(
      averageRate100([
        { stake: 200, rate100: 95000 },
        { stake: 300, rate100: 71250 },
      ]),
    ).toBe(80750);
    expect(averageRate100([])).toBe(0);
  });
});

describe("formatCompactBaht", () => {
  test("keeps small amounts in full and compacts large ones", () => {
    expect(formatCompactBaht(0)).toBe("0");
    expect(formatCompactBaht(950_00)).toBe("950");
    expect(formatCompactBaht(9_999_00)).toBe("9,999");
    expect(formatCompactBaht(10_000_00)).toBe("10K");
    expect(formatCompactBaht(12_940_00)).toBe("12.9K");
    expect(formatCompactBaht(1_250_000_00)).toBe("1.25M");
    expect(formatCompactBaht(125_000_000_00)).toBe("125M");
  });

  test("never shows 1,000K and keeps the sign", () => {
    expect(formatCompactBaht(999_960_00)).toBe("1M");
    expect(formatCompactBaht(-45_000_00)).toBe("-45K");
    expect(formatCompactBaht(-12_34)).toBe("-12");
  });
});

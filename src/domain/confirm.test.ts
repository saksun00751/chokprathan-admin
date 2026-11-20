import { expect, test } from "vitest";
import { changedRows, money, toSatang } from "./confirm";

test("baht typed in a form become satang the same way the server converts them", () => {
  expect(toSatang("500")).toBe(50_000);
  expect(toSatang("-50.5")).toBe(-5_050);
  expect(toSatang(" 1,000 ")).toBe(100_000);
  expect(toSatang("")).toBeNull();
  expect(toSatang("abc")).toBeNull();
  expect(toSatang("0")).toBe(0);
});

test("only the fields that changed are listed, in their original order", () => {
  expect(
    changedRows<unknown>([
      { label: "Name", before: "A", after: "A" },
      { label: "Phone", before: "0811111111", after: "0822222222" },
      { label: "Limit", before: 100, after: 200 },
      { label: "On", before: true, after: true },
    ]),
  ).toEqual([
    { label: "Phone", before: "0811111111", after: "0822222222" },
    { label: "Limit", before: 100, after: 200 },
  ]);
});

test("amounts in a confirmation carry the baht sign, with + or - when the direction matters", () => {
  expect(money(50_000)).toBe("฿500.00");
  expect(money(-50_050)).toBe("-฿500.50");
  expect(money(150_000, true)).toBe("+฿1,500.00");
  expect(money(-100, true)).toBe("-฿1.00");
  expect(money(0, true)).toBe("฿0.00");
});

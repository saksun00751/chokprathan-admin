import { describe, expect, test } from "vitest";
import { doubles, nineteenDoors, permutations, swipeBack, swipeFront, triples, uniq } from "./numbers";

describe("permutations (กลับเลข)", () => {
  test("three distinct digits give 6 numbers in sorted order", () => {
    expect(permutations("123")).toEqual(["123", "132", "213", "231", "312", "321"]);
  });
  test("a repeated digit collapses duplicates", () => {
    expect(permutations("112")).toEqual(["112", "121", "211"]);
    expect(permutations("111")).toEqual(["111"]);
  });
  test("two digits", () => {
    expect(permutations("12")).toEqual(["12", "21"]);
    expect(permutations("11")).toEqual(["11"]);
  });
});

describe("19 ประตู", () => {
  test("gives 19 unique two-digit numbers that all contain the digit", () => {
    const list = nineteenDoors("5");
    expect(list).toHaveLength(19);
    expect(new Set(list).size).toBe(19);
    expect(list.every((n) => n.length === 2 && n.includes("5"))).toBe(true);
    expect(list).toEqual(expect.arrayContaining(["05", "50", "55", "59", "95"]));
  });
  test("rejects anything that is not one digit", () => {
    expect(() => nineteenDoors("12")).toThrow(RangeError);
    expect(() => nineteenDoors("a")).toThrow(RangeError);
  });
});

describe("รูดหน้า / รูดหลัง / เบิ้ล / ตอง", () => {
  test("swipeFront fixes the first digit", () => {
    expect(swipeFront("3")).toEqual(["30", "31", "32", "33", "34", "35", "36", "37", "38", "39"]);
  });
  test("swipeBack fixes the last digit", () => {
    expect(swipeBack("3")).toEqual(["03", "13", "23", "33", "43", "53", "63", "73", "83", "93"]);
  });
  test("doubles and triples", () => {
    expect(doubles()).toEqual(["00", "11", "22", "33", "44", "55", "66", "77", "88", "99"]);
    expect(triples()).toHaveLength(10);
    expect(triples()[9]).toBe("999");
  });
});

test("uniq keeps the first occurrence order", () => {
  expect(uniq(["12", "21", "12", "05"])).toEqual(["12", "21", "05"]);
});

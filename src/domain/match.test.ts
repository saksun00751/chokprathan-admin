import { describe, expect, test } from "vitest";
import { deriveResult, isWinning } from "./match";
import type { RoundResult } from "./types";

describe("deriveResult", () => {
  test("standard takes top3 and bottom2 as entered", () => {
    expect(deriveResult("standard", { top3: "123", bottom2: "45" })).toEqual({
      ok: true,
      result: { top3: "123", bottom2: "45" },
    });
  });
  test("standard rejects a wrong digit count", () => {
    expect(deriveResult("standard", { top3: "12", bottom2: "45" }).ok).toBe(false);
    expect(deriveResult("standard", { top3: "123", bottom2: "4x" }).ok).toBe(false);
  });
  test("Thai government derives top3 from the first prize", () => {
    const r = deriveResult("thai_gov", {
      first6: "123456",
      front3: ["111", "222"],
      back3: ["333", "444"],
      bottom2: "78",
    });
    expect(r).toEqual({
      ok: true,
      result: {
        first6: "123456",
        top3: "456",
        front3: ["111", "222"],
        back3: ["333", "444"],
        bottom2: "78",
      },
    });
  });
  test("Thai government requires both front-three draws", () => {
    expect(deriveResult("thai_gov", { first6: "123456", back3: ["333", "444"], bottom2: "78" }).ok).toBe(false);
  });
  test("Laos four-digit derives top3 from the last three and bottom2 from the first two", () => {
    expect(deriveResult("laos4", { top4: "4925" })).toEqual({
      ok: true,
      result: { top4: "4925", top3: "925", bottom2: "49" },
    });
  });
});

describe("isWinning", () => {
  const r: RoundResult = { top3: "123", bottom2: "45" };
  test("3 ตัวบน matches exactly", () => {
    expect(isWinning("top3", "123", r)).toBe(true);
    expect(isWinning("top3", "321", r)).toBe(false);
  });
  test("3 ตัวโต๊ด matches any order of the same digits", () => {
    expect(isWinning("tod3", "321", r)).toBe(true);
    expect(isWinning("tod3", "122", r)).toBe(false);
    expect(isWinning("tod3", "112", { top3: "121", bottom2: "00" })).toBe(true);
  });
  test("2 ตัวบน is the last two of top3; 2 ตัวล่าง is bottom2", () => {
    expect(isWinning("top2", "23", r)).toBe(true);
    expect(isWinning("top2", "12", r)).toBe(false);
    expect(isWinning("bottom2", "45", r)).toBe(true);
    expect(isWinning("bottom2", "54", r)).toBe(false);
  });
  test("วิ่ง matches a digit anywhere in its part", () => {
    expect(isWinning("runTop", "2", r)).toBe(true);
    expect(isWinning("runTop", "9", r)).toBe(false);
    expect(isWinning("runBottom", "5", r)).toBe(true);
    expect(isWinning("runBottom", "1", r)).toBe(false);
  });
  test("3 ตัวหน้า and 3 ตัวล่าง match either draw", () => {
    const gov: RoundResult = { top3: "456", bottom2: "78", front3: ["111", "222"], back3: ["333", "444"] };
    expect(isWinning("front3", "222", gov)).toBe(true);
    expect(isWinning("front3", "333", gov)).toBe(false);
    expect(isWinning("bottom3", "444", gov)).toBe(true);
    expect(isWinning("bottom3", "111", r)).toBe(false);
  });
  test("4 ตัวบน needs a four-digit result", () => {
    expect(isWinning("top4", "4925", { top4: "4925", top3: "925", bottom2: "49" })).toBe(true);
    expect(isWinning("top4", "4925", r)).toBe(false);
  });
});

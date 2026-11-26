import { describe, expect, test } from "vitest";
import { BET_TYPES, betTypesFor, isValidNumber } from "./betTypes";

describe("bet types per result format", () => {
  test("standard draws", () => {
    expect(betTypesFor("standard")).toEqual(["top3", "tod3", "top2", "bottom2", "runTop", "runBottom"]);
  });
  test("Thai government draw adds front and bottom three", () => {
    expect(betTypesFor("thai_gov")).toEqual([
      "top3",
      "tod3",
      "front3",
      "bottom3",
      "top2",
      "bottom2",
      "runTop",
      "runBottom",
    ]);
  });
  test("Laos four-digit draw adds 4 ตัวบน", () => {
    expect(betTypesFor("laos4")).toEqual(["top4", "top3", "tod3", "top2", "bottom2", "runTop", "runBottom"]);
  });
});

describe("number validation", () => {
  test("length must match the bet type and contain digits only", () => {
    expect(isValidNumber("top3", "123")).toBe(true);
    expect(isValidNumber("top3", "12")).toBe(false);
    expect(isValidNumber("top3", "12a")).toBe(false);
    expect(isValidNumber("runTop", "7")).toBe(true);
    expect(isValidNumber("top4", "0123")).toBe(true);
    expect(isValidNumber("bottom2", "1 2")).toBe(false);
  });
});

test("default pay rates from the spec", () => {
  expect(BET_TYPES.top4.defaultRate100).toBe(600000);
  expect(BET_TYPES.top3.defaultRate100).toBe(95000);
  expect(BET_TYPES.tod3.defaultRate100).toBe(15000);
  expect(BET_TYPES.front3.defaultRate100).toBe(45000);
  expect(BET_TYPES.bottom3.defaultRate100).toBe(45000);
  expect(BET_TYPES.top2.defaultRate100).toBe(9500);
  expect(BET_TYPES.bottom2.defaultRate100).toBe(9500);
  expect(BET_TYPES.runTop.defaultRate100).toBe(320);
  expect(BET_TYPES.runBottom.defaultRate100).toBe(420);
});

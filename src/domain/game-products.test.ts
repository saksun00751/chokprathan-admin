import { expect, test } from "vitest";
import { ambUsername, groupOf, productName, userIdOf } from "./game-products";

test("products fall into slots, live casino, sports, and everything else", () => {
  expect(groupOf("PGSOFT")).toBe("slot");
  expect(groupOf("SAGAME")).toBe("casino");
  expect(groupOf("SBO")).toBe("sport");
  expect(groupOf("KINGMAKER")).toBe("other");
  expect(groupOf("KENO")).toBe("other");
  // A product the list does not know yet goes by its games' type.
  expect(groupOf("NEWVENDOR", "SLOT")).toBe("slot");
  expect(groupOf("NEWVENDOR", "LIVECASINO")).toBe("casino");
  expect(groupOf("NEWVENDOR")).toBe("other");
  expect(productName("PRAGMATIC_LIVECASINO")).toBe("Pragmatic Play LiveCasino");
  expect(productName("NEWVENDOR")).toBe("NEWVENDOR");
});

test("a member's game username maps back to exactly that member", () => {
  expect(ambUsername("cp", 123)).toBe("cp000123");
  expect(userIdOf("cp", "cp000123")).toBe(123);
  expect(userIdOf("cp", "CP000123")).toBe(123);
  expect(userIdOf("cp", "xx000123")).toBeNull();
  expect(userIdOf("cp", "cp12a")).toBeNull();
  expect(userIdOf("cp", 42)).toBeNull();
});

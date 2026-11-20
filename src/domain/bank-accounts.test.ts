import { expect, test } from "vitest";
import { applyMove, archiveBlocker } from "./bank-accounts";

test("a move changes the balance by its amount and may go below zero", () => {
  expect(applyMove(1_000_00, 250_00)).toBe(1_250_00);
  expect(applyMove(100_00, -250_00)).toBe(-150_00);
});

test("a move must be a whole, non-zero number of satang", () => {
  expect(() => applyMove(0, 0)).toThrow();
  expect(() => applyMove(0, 1.5)).toThrow();
});

test("an account can be deleted only at zero balance with no deposit still on its way", () => {
  expect(archiveBlocker({ balance: 0, openDeposits: 0 })).toBeNull();
  expect(archiveBlocker({ balance: 1, openDeposits: 0 })).toBe("balance");
  expect(archiveBlocker({ balance: -1, openDeposits: 0 })).toBe("balance");
  expect(archiveBlocker({ balance: 0, openDeposits: 2 })).toBe("open");
});

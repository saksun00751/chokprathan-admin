import { expect, test } from "vitest";
import { closeBlockers } from "./members";

const clear = { balance: 0, cashback: 0, affiliate: 0, pendingBills: 0, openDeposits: 0, pendingWithdrawals: 0 };

test("an account with no money and nothing open can be closed", () => {
  expect(closeBlockers(clear)).toEqual([]);
});

test("money left in any wallet blocks closing, not just the main balance", () => {
  expect(closeBlockers({ ...clear, cashback: 1 })).toEqual(["cashback"]);
  expect(closeBlockers({ ...clear, affiliate: 5 })).toEqual(["affiliate"]);
  expect(closeBlockers({ ...clear, balance: -1 })).toEqual(["balance"]);
});

test("open bills, deposits, and withdrawals block closing", () => {
  expect(closeBlockers({ ...clear, pendingBills: 2, openDeposits: 1, pendingWithdrawals: 1 })).toEqual(["bills", "deposits", "withdrawals"]);
});

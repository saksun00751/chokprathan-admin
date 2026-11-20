/**
 * Closing a member account ("delete" in the back office) keeps every bill and transaction; it is
 * only allowed when nothing is left that the member or the house would still owe.
 */
export interface CloseState {
  balance: number;
  cashback: number;
  affiliate: number;
  pendingBills: number;
  /** deposits awaiting transfer or review */
  openDeposits: number;
  pendingWithdrawals: number;
}

export type CloseBlocker = "balance" | "cashback" | "affiliate" | "bills" | "deposits" | "withdrawals";

export function closeBlockers(s: CloseState): CloseBlocker[] {
  const out: CloseBlocker[] = [];
  if (s.balance !== 0) out.push("balance");
  if (s.cashback !== 0) out.push("cashback");
  if (s.affiliate !== 0) out.push("affiliate");
  if (s.pendingBills > 0) out.push("bills");
  if (s.openDeposits > 0) out.push("deposits");
  if (s.pendingWithdrawals > 0) out.push("withdrawals");
  return out;
}

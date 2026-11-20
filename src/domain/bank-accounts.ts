/**
 * The website's own bank accounts. A balance only ever changes through a move (deposit approved,
 * withdrawal paid, staff adjustment), each kept in bank_account_moves. Amounts in satang.
 */
export type BankAccountKind = "deposit" | "withdraw";

/** New balance after a move. Negative balances are allowed (payouts never wait for bookkeeping) and shown in red. */
export function applyMove(balance: number, amount: number): number {
  if (!Number.isInteger(amount) || amount === 0) throw new Error("a bank move must be a non-zero whole number of satang");
  return balance + amount;
}

/** Why an account cannot be deleted (archived) yet, or null. */
export function archiveBlocker(a: { balance: number; openDeposits: number }): "balance" | "open" | null {
  if (a.balance !== 0) return "balance";
  if (a.openDeposits > 0) return "open";
  return null;
}

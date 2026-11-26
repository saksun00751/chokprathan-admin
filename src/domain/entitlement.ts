/**
 * What a bill entitles whom to under a result, and how a change of entitlement is taken from or paid
 * into wallets. Pure, so the payout, the correction and its preview cannot disagree. Money is satang.
 */
import { isWinning } from "@/core/rules/match";
import type { BetTypeCode, RoundResult } from "@/core/rules/types";
import type { WalletKind } from "@/core/wallet/debt";

export interface Rewards {
  cashbackBp: number;
  aff1Bp: number;
  aff2Bp: number;
}

export interface EntitledItem {
  bet_type: BetTypeCode;
  number: string;
  /** whole baht */
  stake: number;
  discount: number;
  potential: number;
}

export interface Entitled {
  status: "won" | "lost" | "refunded";
  payout: number;
  cashback: number;
  aff1: number;
  aff2: number;
  /** stake given back when the round is voided */
  refund: number;
  /** ids of the items that win */
  winners: Set<EntitledItem>;
}

/** `paid` is what the member paid for the bill; an upline that does not exist earns nothing. */
export function entitled(
  paid: number,
  items: EntitledItem[],
  target: RoundResult | "void",
  rewards: Rewards,
  uplines: { aff1: boolean; aff2: boolean },
): Entitled {
  if (target === "void") return { status: "refunded", payout: 0, cashback: 0, aff1: 0, aff2: 0, refund: paid, winners: new Set() };
  const winners = new Set(items.filter((i) => isWinning(i.bet_type, i.number, target)));
  const payout = [...winners].reduce((s, i) => s + i.potential, 0);
  const lostPaid = items.filter((i) => !winners.has(i)).reduce((s, i) => s + i.stake * 100 - i.discount, 0);
  const share = (bp: number) => Math.floor((paid * bp) / 10_000);
  return {
    status: winners.size ? "won" : "lost",
    payout,
    cashback: Math.floor((lostPaid * rewards.cashbackBp) / 10_000),
    aff1: uplines.aff1 ? share(rewards.aff1Bp) : 0,
    aff2: uplines.aff2 ? share(rewards.aff2Bp) : 0,
    refund: 0,
    winners,
  };
}

export type CorrectionType = "win_correction" | "cashback_correction" | "aff_correction" | "refund";

/** One change of what a member is entitled to, signed: positive pays them, negative takes back. */
export interface Line {
  ref: string;
  wallet: WalletKind;
  type: CorrectionType;
  amount: number;
}

export type Wallets = Record<WalletKind, number>;

export interface Settled {
  ledger: (Line & { after: number })[];
  wallets: Wallets;
  /** satang that could not be taken back: it becomes a debt */
  shortfall: number;
}

/**
 * Apply a member's changes to their wallets: everything owed to them first, then what is taken back,
 * from the wallet that received it and then the main wallet. No wallet goes below zero.
 */
export function settleLines(start: Wallets, lines: Line[]): Settled {
  const wallets = { ...start };
  const ledger: Settled["ledger"] = [];
  let shortfall = 0;
  const move = (line: Line, wallet: WalletKind, amount: number) => {
    if (amount === 0) return;
    wallets[wallet] += amount;
    ledger.push({ ...line, wallet, amount, after: wallets[wallet] });
  };
  for (const line of lines.filter((l) => l.amount > 0)) move(line, line.wallet, line.amount);
  for (const line of lines.filter((l) => l.amount < 0)) {
    let owed = -line.amount;
    for (const wallet of line.wallet === "balance" ? (["balance"] as const) : ([line.wallet, "balance"] as const)) {
      const take = Math.min(owed, wallets[wallet]);
      move(line, wallet, take ? -take : 0);
      owed -= take;
    }
    shortfall += owed;
  }
  return { ledger, wallets, shortfall };
}

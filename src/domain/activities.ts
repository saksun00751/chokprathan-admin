import type { PointRule } from "./points";

/**
 * Activities members play with their points to win credit: a lucky wheel and a guess of the
 * bottom two digits of a lottery round. Credit won carries a turnover requirement (like a promotion
 * bonus) so depositing and withdrawing just to farm points does not pay.
 */

/** Chances are whole basis points: 10,000 = 100%. */
export const CHANCE_TOTAL = 10_000;

export interface WheelPrize {
  /** satang; 0 = "try again" */
  amount: number;
  /** out of CHANCE_TOTAL */
  chance: number;
}

export interface WheelSettings {
  enabled: boolean;
  /** points per spin */
  cost: number;
  /** spins per member per day; 0 = no limit */
  dailyLimit: number;
  prizes: WheelPrize[];
  /** turnover multiple on credit won */
  turnoverX: number;
  /** credit paid by the wheel per day (satang); 0 = no cap */
  dailyBudget: number;
}

export interface GuessSettings {
  enabled: boolean;
  /** points per number guessed */
  cost: number;
  /** satang per correct guess */
  prize: number;
  /** numbers per member per round */
  maxPerRound: number;
  /** credit paid per round (satang), split evenly when winners would exceed it; 0 = no cap */
  roundBudget: number;
  turnoverX: number;
  /** lotteries whose rounds can be guessed */
  lottoIds: number[];
}

export interface ActivitySettings {
  wheel: WheelSettings;
  guess: GuessSettings;
}

/** The recommended setup, switched off until the owner turns it on. */
export const DEFAULT_ACTIVITIES: ActivitySettings = {
  wheel: {
    enabled: false,
    cost: 10,
    dailyLimit: 5,
    prizes: [
      { amount: 0, chance: 3000 },
      { amount: 5_00, chance: 3500 },
      { amount: 10_00, chance: 2000 },
      { amount: 20_00, chance: 1000 },
      { amount: 50_00, chance: 400 },
      { amount: 200_00, chance: 90 },
      { amount: 1_000_00, chance: 10 },
    ],
    turnoverX: 1,
    dailyBudget: 0,
  },
  guess: { enabled: false, cost: 5, prize: 300_00, maxPerRound: 10, roundBudget: 0, turnoverX: 1, lottoIds: [] },
};

/** The slot a roll in [0, CHANCE_TOTAL) lands on. */
export function pickPrize(prizes: WheelPrize[], roll: number): number {
  let acc = 0;
  for (let i = 0; i < prizes.length; i++) {
    acc += prizes[i].chance;
    if (roll < acc) return i;
  }
  return prizes.length - 1;
}

/** Average credit paid per spin, in satang. */
export const wheelAverage = (prizes: WheelPrize[]) => Math.round(prizes.reduce((sum, p) => sum + p.amount * p.chance, 0) / CHANCE_TOTAL);

/**
 * An average payout as a share of the deposits that earned the points it costs: with "฿100 → 1 point",
 * a 10-point spin stands for ฿1,000 deposited. Null when points are off.
 */
export function returnShare(average: number, cost: number, rule: PointRule): number | null {
  if (!rule.enabled || rule.points <= 0 || rule.every <= 0 || cost <= 0) return null;
  return average / ((cost * rule.every) / rule.points);
}

/**
 * The slot actually paid when only `remaining` satang of the day's budget is left (null = no cap):
 * the drawn one if affordable, else the largest affordable prize, else the first "try again".
 */
export function affordableSlot(prizes: WheelPrize[], slot: number, remaining: number | null): number {
  if (remaining === null || prizes[slot].amount <= remaining) return slot;
  let best = -1;
  for (let i = 0; i < prizes.length; i++) if (prizes[i].amount <= remaining && (best < 0 || prizes[i].amount > prizes[best].amount)) best = i;
  return best >= 0 ? best : slot;
}

const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

export function wheelProblem(w: WheelSettings): "cost" | "limit" | "prizes" | "chances" | "turnover" | "budget" | null {
  if (!whole(w.cost, 1, 100_000)) return "cost";
  if (!whole(w.dailyLimit, 0, 1_000)) return "limit";
  if (!Array.isArray(w.prizes) || w.prizes.length < 2 || w.prizes.length > 12) return "prizes";
  if (w.prizes.some((p) => !whole(p.amount, 0, 1_000_000_00) || !whole(p.chance, 0, CHANCE_TOTAL))) return "prizes";
  if (w.prizes.reduce((s, p) => s + p.chance, 0) !== CHANCE_TOTAL) return "chances";
  if (!whole(w.turnoverX, 0, 50)) return "turnover";
  if (!whole(w.dailyBudget, 0, 1_000_000_000_00)) return "budget";
  return null;
}

export function guessProblem(g: GuessSettings): "cost" | "prize" | "limit" | "budget" | "turnover" | "lottos" | null {
  if (!whole(g.cost, 1, 100_000)) return "cost";
  if (!whole(g.prize, 1_00, 1_000_000_00)) return "prize";
  if (!whole(g.maxPerRound, 1, 100)) return "limit";
  if (!whole(g.roundBudget, 0, 1_000_000_000_00)) return "budget";
  if (!whole(g.turnoverX, 0, 50)) return "turnover";
  if (!Array.isArray(g.lottoIds) || g.lottoIds.some((id) => !whole(id, 1, 2_147_483_647))) return "lottos";
  if (g.enabled && g.lottoIds.length === 0) return "lottos";
  return null;
}

/** Each winner's credit: the prize, or an even split of the round budget when that would be passed. */
export function guessPayout(prize: number, winners: number, budget: number): number {
  if (winners <= 0) return 0;
  if (budget > 0 && prize * winners > budget) return Math.floor(budget / winners);
  return prize;
}

export const isGuessNumber = (v: unknown): v is string => typeof v === "string" && /^\d{2}$/.test(v);

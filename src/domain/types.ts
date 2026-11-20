export type BetTypeCode =
  | "top4"
  | "top3"
  | "tod3"
  | "front3"
  | "bottom3"
  | "top2"
  | "bottom2"
  | "runTop"
  | "runBottom";

export type ResultFormat = "standard" | "thai_gov" | "laos4";
export type LottoGroup = "thai" | "foreign" | "stock" | "yiki";

export interface RoundResult {
  top3: string;
  bottom2: string;
  top4?: string;
  front3?: [string, string];
  back3?: [string, string];
  first6?: string;
}

/** A slice of a stake paid at one rate. stake in whole baht, rate100 = rate × 100. */
export interface Segment {
  stake: number;
  rate100: number;
}

/** From `threshold` baht of total stake on a number, pay `percent` of the base rate. */
export interface RiskTier {
  threshold: number;
  percent: number;
}

export interface RiskProfile {
  enabled: boolean;
  tiers: RiskTier[];
  /** Total stake (baht) at which the number stops accepting bets. null = no cap. */
  cap: number | null;
}

export type ManualLimit = { kind: "percent"; percent: number } | { kind: "closed" };

/** days for weekly: 0 = Sunday … 6 = Saturday. close: "HH:MM" Asia/Bangkok. */
export type Schedule =
  | { kind: "weekly"; days: number[]; close: string }
  | { kind: "monthly"; days: number[]; close: string }
  | { kind: "interval"; firstClose: string; everyMin: number; count: number };

import { betTypesFor } from "./betTypes";
import type { BetTypeCode, ResultFormat, RiskProfile } from "./types";

/**
 * Everything a bet on one round is priced against. A copy is stored with the round and stops
 * changing once the round has a bill, so later edits to a lottery never move accepted prices.
 */
export interface RoundConfig {
  format: ResultFormat;
  /** whole baht */
  maxPerBill: number;
  maxLines: number;
  betTypes: Partial<Record<BetTypeCode, BetTypeRules>>;
  packages: RoundPackage[];
}

export interface BetTypeRules {
  /** whole baht */
  minStake: number;
  /** whole baht */
  maxPerNumber: number;
  risk: RiskProfile;
}

export interface PackageRate {
  /** payout rate × 100 */
  rate100: number;
  /** discount off the stake, in basis points */
  discountBp: number;
}

export interface RoundPackage {
  id: number;
  code: string;
  name: string;
  rates: Partial<Record<BetTypeCode, PackageRate>>;
}

export interface RoundConfigInput {
  format: ResultFormat;
  maxPerBill: number;
  maxLines: number;
  betTypes: (BetTypeRules & { code: BetTypeCode; enabled: boolean })[];
  packages: (RoundPackage & {
    sort: number;
    /** This lottery's own values; null inherits the package's. */
    overrides: Partial<Record<BetTypeCode, { rate100: number | null; discountBp: number | null }>>;
  })[];
}

export type RoundConfigResult = { ok: true; config: RoundConfig } | { ok: false; error: "noBetTypes" | "noPackages" | "badRate" };

export const MAX_DISCOUNT_BP = 9999;

const isDiscount = (bp: number) => Number.isInteger(bp) && bp >= 0 && bp <= MAX_DISCOUNT_BP;

/** Discount in satang on a stake of whole baht, rounded down. */
export function discountOf(stake: number, discountBp: number): number {
  if (!Number.isInteger(stake) || stake <= 0) throw new RangeError("stake must be a positive whole number of baht");
  if (!isDiscount(discountBp)) throw new RangeError("discount must be 0 to 9999 basis points");
  return Math.floor((stake * discountBp) / 100);
}

/** What the member actually pays, in satang. */
export const netOf = (stake: number, discountBp: number) => stake * 100 - discountOf(stake, discountBp);

/** Deterministic: equal input rows give a byte-equal JSON, so stored copies can be compared. */
export function buildRoundConfig(input: RoundConfigInput): RoundConfigResult {
  const betTypes: RoundConfig["betTypes"] = {};
  const offered = betTypesFor(input.format).filter((code) => {
    const row = input.betTypes.find((b) => b.code === code);
    if (!row?.enabled) return false;
    betTypes[code] = {
      minStake: row.minStake,
      maxPerNumber: row.maxPerNumber,
      // Rebuilt field by field so the key order does not depend on how the profile was saved.
      risk: { enabled: row.risk.enabled, tiers: row.risk.tiers.map((t) => ({ threshold: t.threshold, percent: t.percent })), cap: row.risk.cap },
    };
    return true;
  });
  if (offered.length === 0) return { ok: false, error: "noBetTypes" };

  const packages: RoundPackage[] = [];
  for (const p of [...input.packages].sort((a, b) => a.sort - b.sort || a.id - b.id)) {
    const rates: RoundPackage["rates"] = {};
    for (const code of offered) {
      const base = p.rates[code];
      if (!base) continue;
      const rate100 = p.overrides[code]?.rate100 ?? base.rate100;
      const discountBp = p.overrides[code]?.discountBp ?? base.discountBp;
      if (!Number.isInteger(rate100) || rate100 <= 0 || !isDiscount(discountBp)) return { ok: false, error: "badRate" };
      rates[code] = { rate100, discountBp };
    }
    if (Object.keys(rates).length) packages.push({ id: p.id, code: p.code, name: p.name, rates });
  }
  if (packages.length === 0) return { ok: false, error: "noPackages" };
  return { ok: true, config: { format: input.format, maxPerBill: input.maxPerBill, maxLines: input.maxLines, betTypes, packages } };
}

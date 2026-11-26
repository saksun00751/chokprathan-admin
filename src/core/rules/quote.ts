import { BET_TYPE_ORDER, BET_TYPES, isValidNumber } from "./betTypes";
import { averageRate100, payoutOf } from "./money";
import { priceStake } from "./pricing";
import { discountOf, type RoundConfig } from "./roundConfig";
import type { BetTypeCode, ManualLimit, RiskProfile, Segment } from "./types";

export interface SlipLine {
  betType: BetTypeCode;
  number: string;
  /** whole baht */
  stake: number;
}

export interface BetRule {
  code: BetTypeCode;
  digits: number;
  rate100: number;
  discountBp: number;
  minStake: number;
  maxPerNumber: number;
  profile: RiskProfile;
}

export type LineReason = "unavailable" | "invalid" | "min" | "max" | "closed" | "cap";

type LineBase = SlipLine & { baseRate100: number };
export type PricedLine =
  | (LineBase & { ok: true; segments: Segment[]; rate100: number; potential: number; reduced: boolean; discount: number; net: number })
  | (LineBase & { ok: false; reason: LineReason; remaining?: number; limit?: number });

export type SlipError = "package" | "empty" | "too_many_lines" | "over_bill_limit";

export interface PriceSlipInput {
  config: RoundConfig;
  /** The first package when not given. */
  packageId?: number;
  lines: SlipLine[];
  /** Keyed by `slipKey`. */
  manual: Map<string, ManualLimit>;
  /** Baht accepted on each number from every member. */
  totals: Map<string, number>;
  /** Baht this member already holds on each number in this round. */
  held: Map<string, number>;
}

export interface PricedSlip {
  ok: boolean;
  error?: SlipError;
  packageId: number;
  lines: PricedLine[];
  /** whole baht, before discount, every line */
  totalStake: number;
  /** satang, accepted lines only */
  totalDiscount: number;
  /** satang the member pays for the accepted lines */
  totalNet: number;
}

export const slipKey = (betType: string, number: string) => `${betType}:${number}`;

const packageOf = (config: RoundConfig, packageId?: number) =>
  packageId === undefined ? config.packages[0] : config.packages.find((p) => p.id === packageId);

/** What a package offers on this round, in the standard order. */
export function betRules(config: RoundConfig, packageId?: number): BetRule[] {
  const pack = packageOf(config, packageId);
  if (!pack) return [];
  return BET_TYPE_ORDER.flatMap((code) => {
    const rules = config.betTypes[code];
    const rate = pack.rates[code];
    if (!rules || !rate) return [];
    return [{ code, digits: BET_TYPES[code].digits, ...rate, minStake: rules.minStake, maxPerNumber: rules.maxPerNumber, profile: rules.risk }];
  });
}

/** Price every line of a slip. Pure: the caller supplies totals and limits (under locks when placing). */
export function priceSlip({ config, packageId, lines, manual, totals, held }: PriceSlipInput): PricedSlip {
  const pack = packageOf(config, packageId);
  const empty = { ok: false, packageId: pack?.id ?? packageId ?? 0, lines: [], totalStake: 0, totalDiscount: 0, totalNet: 0 };
  if (!pack) return { ...empty, error: "package" };
  if (lines.length === 0) return { ...empty, error: "empty" };
  if (lines.length > config.maxLines) return { ...empty, error: "too_many_lines" };

  const rules = new Map(betRules(config, pack.id).map((r) => [r.code, r]));
  const running = new Map<string, number>();
  const inSlip = new Map<string, number>();

  const priced: PricedLine[] = lines.map((line) => {
    const rule = rules.get(line.betType);
    const base: LineBase = { betType: line.betType, number: line.number, stake: line.stake, baseRate100: rule?.rate100 ?? 0 };
    if (!rule) return { ...base, ok: false, reason: "unavailable" };
    if (!isValidNumber(line.betType, line.number)) return { ...base, ok: false, reason: "invalid" };
    if (!Number.isInteger(line.stake) || line.stake < rule.minStake) return { ...base, ok: false, reason: "min", limit: rule.minStake };
    const key = slipKey(line.betType, line.number);
    const mine = (inSlip.get(key) ?? 0) + line.stake;
    const had = (held.get(key) ?? 0) + (inSlip.get(key) ?? 0);
    if ((held.get(key) ?? 0) + mine > rule.maxPerNumber) {
      return { ...base, ok: false, reason: "max", limit: rule.maxPerNumber, remaining: Math.max(0, rule.maxPerNumber - had) };
    }
    const current = running.get(key) ?? totals.get(key) ?? 0;
    const result = priceStake({
      baseRate100: rule.rate100,
      profile: rule.profile,
      manual: manual.get(key) ?? null,
      currentTotal: current,
      stake: line.stake,
    });
    if (!result.ok) return { ...base, ok: false, reason: result.reason, remaining: result.remaining };
    running.set(key, current + line.stake);
    inSlip.set(key, mine);
    const discount = discountOf(line.stake, rule.discountBp);
    return {
      ...base,
      ok: true,
      segments: result.segments,
      rate100: averageRate100(result.segments),
      potential: payoutOf(result.segments),
      reduced: result.segments.some((s) => s.rate100 < rule.rate100),
      discount,
      net: line.stake * 100 - discount,
    };
  });

  const accepted = priced.filter((l): l is Extract<PricedLine, { ok: true }> => l.ok);
  const totalStake = lines.reduce((sum, l) => sum + (Number.isFinite(l.stake) ? l.stake : 0), 0);
  const over = totalStake > config.maxPerBill;
  return {
    ok: !over && accepted.length === priced.length,
    ...(over ? { error: "over_bill_limit" as const } : {}),
    packageId: pack.id,
    lines: priced,
    totalStake,
    totalDiscount: accepted.reduce((s, l) => s + l.discount, 0),
    totalNet: accepted.reduce((s, l) => s + l.net, 0),
  };
}

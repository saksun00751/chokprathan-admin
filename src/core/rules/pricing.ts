import type { ManualLimit, RiskProfile, Segment } from "./types";

/**
 * Risk engine: automatic payout-rate reduction.
 *
 * Every (round, bet type, number) has a running total of accepted stake.
 * A profile lowers the rate in tiers as that total grows, and stops accepting
 * at `cap`. A new stake is split at tier thresholds so each baht is paid at
 * the rate that applied when it arrived. Admins can also cap a number's rate
 * by hand (`manual percent`) or close it.
 */

export interface PriceInput {
  baseRate100: number;
  profile: RiskProfile;
  manual: ManualLimit | null;
  /** Baht already accepted on this number in this round, from every member. */
  currentTotal: number;
  /** Baht to price. Whole baht only. */
  stake: number;
}

export type PriceResult =
  | { ok: true; segments: Segment[] }
  | { ok: false; reason: "closed" | "cap"; remaining: number };

const percentOf = (rate100: number, percent: number) => Math.floor((rate100 * percent) / 100);

function tierRate(baseRate100: number, profile: RiskProfile, total: number): number {
  if (!profile.enabled) return baseRate100;
  let percent = 100;
  for (const tier of profile.tiers) if (total >= tier.threshold) percent = tier.percent;
  return percent === 100 ? baseRate100 : percentOf(baseRate100, percent);
}

function manualRate(baseRate100: number, manual: ManualLimit | null): number {
  return manual?.kind === "percent" ? percentOf(baseRate100, manual.percent) : Number.POSITIVE_INFINITY;
}

export function priceStake({ baseRate100, profile, manual, currentTotal, stake }: PriceInput): PriceResult {
  if (!Number.isInteger(stake) || stake <= 0) throw new RangeError("stake must be a positive whole number of baht");
  if (!Number.isInteger(currentTotal) || currentTotal < 0) throw new RangeError("currentTotal must be a non-negative integer");

  if (manual?.kind === "closed") return { ok: false, reason: "closed", remaining: 0 };

  const cap = profile.enabled ? profile.cap : null;
  if (cap !== null && currentTotal + stake > cap) {
    return { ok: false, reason: "cap", remaining: Math.max(0, cap - currentTotal) };
  }

  const end = currentTotal + stake;
  const cuts = profile.enabled
    ? profile.tiers.map((t) => t.threshold).filter((th) => th > currentTotal && th < end)
    : [];
  const points = [currentTotal, ...cuts.sort((a, b) => a - b), end];
  const ceiling = manualRate(baseRate100, manual);

  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const size = points[i + 1] - points[i];
    if (size <= 0) continue;
    const rate100 = Math.min(tierRate(baseRate100, profile, points[i]), ceiling);
    const last = segments.at(-1);
    if (last && last.rate100 === rate100) last.stake += size;
    else segments.push({ stake: size, rate100 });
  }
  return { ok: true, segments };
}

/** The rate the next baht on this number would get, or null if the number is closed. */
export function marginalRate100(
  baseRate100: number,
  profile: RiskProfile,
  manual: ManualLimit | null,
  total: number,
): number | null {
  if (manual?.kind === "closed") return null;
  if (profile.enabled && profile.cap !== null && total >= profile.cap) return null;
  return Math.min(tierRate(baseRate100, profile, total), manualRate(baseRate100, manual));
}

/** What a bad profile says; the caller passes the request's language (Thai by default). `{n}` is the tier number. */
export interface ProfileMessages {
  threshold: string;
  percent: string;
  ascending: string;
  descending: string;
  capPositive: string;
  capAbove: string;
}

const TH: ProfileMessages = {
  threshold: "ขั้นที่ {n}: ยอดสะสมต้องเป็นจำนวนเต็มมากกว่า 0",
  percent: "ขั้นที่ {n}: เปอร์เซ็นต์ต้องอยู่ระหว่าง 1 ถึง 99",
  ascending: "ขั้นที่ {n}: ยอดสะสมต้องมากกว่าขั้นก่อนหน้า",
  descending: "ขั้นที่ {n}: เปอร์เซ็นต์ต้องน้อยกว่าขั้นก่อนหน้า",
  capPositive: "ยอดปิดรับต้องเป็นจำนวนเต็มมากกว่า 0",
  capAbove: "ยอดปิดรับต้องมากกว่ายอดสะสมของขั้นสุดท้าย",
};

/** Human-readable problems with a profile; empty when valid. */
export function validateProfile(p: RiskProfile, m: ProfileMessages = TH): string[] {
  const errors: string[] = [];
  const at = (template: string, i: number) => template.replace("{n}", String(i + 1));
  p.tiers.forEach((tier, i) => {
    if (!Number.isInteger(tier.threshold) || tier.threshold <= 0) errors.push(at(m.threshold, i));
    if (!Number.isInteger(tier.percent) || tier.percent < 1 || tier.percent > 99) errors.push(at(m.percent, i));
    const prev = p.tiers[i - 1];
    if (prev && tier.threshold <= prev.threshold) errors.push(at(m.ascending, i));
    if (prev && tier.percent >= prev.percent) errors.push(at(m.descending, i));
  });
  if (p.cap !== null) {
    const last = p.tiers.at(-1);
    if (!Number.isInteger(p.cap) || p.cap <= 0) errors.push(m.capPositive);
    else if (last && p.cap <= last.threshold) errors.push(m.capAbove);
  }
  return errors;
}

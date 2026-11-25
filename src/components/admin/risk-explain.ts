import { BET_TYPES } from "chokprathan-core/rules/betTypes";
import { formatRate } from "chokprathan-core/rules/money";
import { marginalRate100 } from "chokprathan-core/rules/pricing";
import type { BetTypeCode, RiskProfile } from "chokprathan-core/rules/types";

/**
 * Plain-language summary of a risk profile, for the tier editor. No React and no dictionary here:
 * this returns numbers and the component words them. Every rate comes from `marginalRate100`, the
 * function the bet pricing uses, so the summary cannot disagree with what a member is paid.
 */

export type ExplainRow =
  /** Profile switched off: the base rate, whatever the total. */
  | { kind: "off"; rate100: number }
  /** Switched on but with no steps and no cap: nothing ever changes. */
  | { kind: "flat"; rate100: number }
  /** Below the first step (or the cap when there are no steps). */
  | { kind: "start"; to: number; rate100: number }
  | { kind: "tier"; from: number; percent: number; rate100: number }
  | { kind: "close"; from: number };

export type ExplainExample =
  | { kind: "rate"; sample: string; total: number; rate100: number }
  | { kind: "closed"; sample: string; total: number };

export interface Explanation {
  rows: ExplainRow[];
  example: ExplainExample | null;
}

const SAMPLES: Record<number, string> = { 1: "5", 2: "47", 3: "123", 4: "1234" };

/** A believable number for the bet type: "47" for two digits. Two digits when the type is unknown. */
export function sampleNumber(betType?: BetTypeCode): string {
  const digits = betType ? BET_TYPES[betType].digits : 2;
  return SAMPLES[digits] ?? "1234567890".slice(0, digits);
}

/** The rate a whole-baht stake gets at `total`, as the pricing computes it (the cap is shown on its own line). */
const rateAt = (baseRate100: number, profile: RiskProfile, total: number) =>
  marginalRate100(baseRate100, { ...profile, cap: null }, null, total) ?? baseRate100;

/** The rate a tier of `percent` pays, through the pricing code. Matches the chip on each tier row. */
export function percentRate100(baseRate100: number, percent: number): number {
  return marginalRate100(baseRate100, { enabled: true, tiers: [{ threshold: 0, percent }], cap: null }, null, 0) ?? baseRate100;
}

/**
 * A round total strictly between `from` and `to` for the example: the midpoint to the nearest 100,
 * or to the nearest 10 or 1 when the gap is too small. Falls back to `from` itself.
 */
export function exampleTotal(from: number, to: number): number {
  const mid = (from + to) / 2;
  for (const step of [100, 10, 1]) {
    const r = Math.round(mid / step) * step;
    if (r > from && r < to) return r;
  }
  return from;
}

export function explainProfile(profile: RiskProfile, baseRate100: number, betType?: BetTypeCode): Explanation {
  if (!profile.enabled) return { rows: [{ kind: "off", rate100: baseRate100 }], example: null };

  const sample = sampleNumber(betType);
  const tiers = profile.tiers;
  const cap = profile.cap;
  if (tiers.length === 0 && cap === null) return { rows: [{ kind: "flat", rate100: baseRate100 }], example: null };

  const firstAt = tiers.length > 0 ? Math.min(...tiers.map((t) => t.threshold)) : (cap as number);
  const rows: ExplainRow[] = [{ kind: "start", to: firstAt, rate100: rateAt(baseRate100, profile, 0) }];
  for (const t of tiers) rows.push({ kind: "tier", from: t.threshold, percent: t.percent, rate100: rateAt(baseRate100, profile, t.threshold) });
  if (cap !== null) rows.push({ kind: "close", from: cap });

  if (tiers.length === 0) return { rows, example: { kind: "closed", sample, total: cap as number } };

  const first = tiers[0].threshold;
  const next = tiers[1]?.threshold ?? cap ?? first * 1.5;
  const total = exampleTotal(first, next);
  const rate100 = marginalRate100(baseRate100, profile, null, total);
  return {
    rows,
    example: rate100 === null ? { kind: "closed", sample, total } : { kind: "rate", sample, total, rate100 },
  };
}

/** One bet type's settings as a card on the risk page edits them. */
export interface CardValues {
  rate100: number;
  maxPerNumber: number;
  profile: RiskProfile;
}

export function sameProfile(a: RiskProfile, b: RiskProfile): boolean {
  return (
    a.enabled === b.enabled &&
    a.cap === b.cap &&
    a.tiers.length === b.tiers.length &&
    a.tiers.every((t, i) => t.threshold === b.tiers[i].threshold && t.percent === b.tiers[i].percent)
  );
}

/** True when the card already holds the system defaults, compared by value. */
export function equalsDefaults(card: CardValues, defaults: CardValues): boolean {
  return card.rate100 === defaults.rate100 && card.maxPerNumber === defaults.maxPerNumber && sameProfile(card.profile, defaults.profile);
}

/** Texts for `defaultsSummary`, from the dictionary (`{rate}`, `{max}`, `{tiers}`, `{list}`, `{cap}`). */
export interface SummaryMessages {
  summary: string;
  tiers: string;
  close: string;
  off: string;
}

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/**
 * "จ่ายบาทละ 95 · สูงสุดต่อเลขต่อโพย 2,000 บาท · ลดที่ 5,000 / 15,000 · หยุดรับที่ 30,000".
 * `num` formats a whole amount (the page passes its own number format).
 */
export function defaultsSummary(d: CardValues, m: SummaryMessages, num: (n: number) => string): string {
  const parts: string[] = [];
  if (d.profile.enabled && d.profile.tiers.length > 0) parts.push(fill(m.tiers, { list: d.profile.tiers.map((t) => num(t.threshold)).join(" / ") }));
  if (d.profile.enabled && d.profile.cap !== null) parts.push(fill(m.close, { cap: num(d.profile.cap) }));
  const tiers = parts.length > 0 ? parts.join(" · ") : m.off;
  return fill(m.summary, { rate: formatRate(d.rate100), max: num(d.maxPerNumber), tiers });
}

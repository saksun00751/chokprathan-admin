import type { Segment } from "./types";

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Format satang as baht: "5,000.00". */
export function formatBaht(
  satang: number,
  { decimals = "always", sign = false }: { decimals?: "always" | "auto" | "never"; sign?: boolean } = {},
): string {
  const abs = Math.abs(Math.trunc(satang));
  const baht = Math.floor(abs / 100);
  const st = abs % 100;
  let out = group(baht);
  if (decimals === "always" || (decimals === "auto" && st !== 0)) out += "." + String(st).padStart(2, "0");
  const prefix = satang < 0 ? "-" : sign && satang > 0 ? "+" : "";
  return prefix + out;
}

/** Format a rate stored as rate × 100: 95000 → "950", 320 → "3.2". */
export function formatRate(rate100: number): string {
  const whole = Math.floor(rate100 / 100);
  const frac = rate100 % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

/** Winning payout in satang: Σ stake(baht) × rate100. */
export function payoutOf(segments: readonly Segment[]): number {
  return segments.reduce((sum, s) => sum + s.stake * s.rate100, 0);
}

/** Stake-weighted average rate100, rounded down. */
export function averageRate100(segments: readonly Segment[]): number {
  const stake = segments.reduce((sum, s) => sum + s.stake, 0);
  return stake === 0 ? 0 : Math.floor(payoutOf(segments) / stake);
}

const trim = (n: number, digits: number) => n.toFixed(digits).replace(/\.?0+$/, "");

/** Whole-baht amount for axes and dense figures: "9,999", "12.9K", "1.25M". */
export function formatCompactBaht(satang: number): string {
  const baht = Math.trunc(satang / 100);
  const abs = Math.abs(baht);
  const sign = baht < 0 ? "-" : "";
  if (abs < 10_000) return sign + group(abs);
  const k = abs / 1_000;
  if (Number(k.toFixed(1)) < 1_000) return `${sign}${trim(k, 1)}K`;
  const m = abs / 1_000_000;
  return `${sign}${trim(m, m >= 100 ? 0 : 2)}M`;
}

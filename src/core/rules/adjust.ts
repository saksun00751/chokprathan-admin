/**
 * Limits on staff adjustments of a member's balance (settings, "money" section). They apply to the
 * size of each adjustment, whether it adds or deducts. Amounts in satang.
 */
export interface AdjustLimits {
  adjustMin: number;
  adjustMax: number;
}

export const DEFAULT_ADJUST_LIMITS: AdjustLimits = { adjustMin: 1_00, adjustMax: 100_000_00 };

/** Highest maximum the settings page accepts: ฿10,000,000. */
export const ADJUST_CEILING = 10_000_000_00;

export function adjustLimitError(amount: number, limits: AdjustLimits): "zero" | "min" | "max" | null {
  const size = Math.abs(amount);
  if (size === 0) return "zero";
  if (size < limits.adjustMin) return "min";
  if (size > limits.adjustMax) return "max";
  return null;
}

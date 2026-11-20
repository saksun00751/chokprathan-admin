/**
 * Loyalty points. Members earn them for money coming in: approved deposits and credit staff add
 * through the back office. The rule is "deposit ฿X, get N points", counted per deposit and rounded
 * down (฿150 under "฿100 → 1" earns 1). Promotion bonuses, cashback, and commission earn nothing.
 */
export interface PointRule {
  enabled: boolean;
  /** satang per step: 100_00 = every ฿100 */
  every: number;
  /** points per step */
  points: number;
}

export const DEFAULT_POINT_RULE: PointRule = { enabled: true, every: 100_00, points: 1 };

const MAX_EVERY = 1_000_000_00;
export const MAX_POINTS = 1_000_000;

export function pointsFor(amount: number, rule: PointRule): number {
  if (!rule.enabled || rule.every <= 0 || rule.points <= 0 || amount <= 0) return 0;
  return Math.floor(amount / rule.every) * rule.points;
}

/** Why a rule from the settings page cannot be saved, or null. */
export function pointRuleProblem(rule: PointRule): "every" | "points" | null {
  if (!Number.isInteger(rule.every) || rule.every < 1_00 || rule.every > MAX_EVERY) return "every";
  if (!Number.isInteger(rule.points) || rule.points < 1 || rule.points > MAX_POINTS) return "points";
  return null;
}

/** Why a staff change of `delta` points cannot be made, or null. */
export function pointsAdjustProblem(delta: number): "zero" | "invalid" | "max" | null {
  if (!Number.isInteger(delta)) return "invalid";
  if (delta === 0) return "zero";
  if (Math.abs(delta) > MAX_POINTS) return "max";
  return null;
}

import type { BetTypeCode, ResultFormat } from "./types";

/** Display names live in the dictionaries (t.lotto.betTypes). */
export interface BetTypeDef {
  code: BetTypeCode;
  digits: number;
  defaultRate100: number;
  /** Default max stake per number per bill, baht. */
  defaultMaxPerNumber: number;
  formats: readonly ResultFormat[];
}

const ALL: readonly ResultFormat[] = ["standard", "thai_gov", "laos4"];

export const BET_TYPES: Record<BetTypeCode, BetTypeDef> = {
  top4: { code: "top4", digits: 4, defaultRate100: 600000, defaultMaxPerNumber: 200, formats: ["laos4"] },
  top3: { code: "top3", digits: 3, defaultRate100: 95000, defaultMaxPerNumber: 2000, formats: ALL },
  tod3: { code: "tod3", digits: 3, defaultRate100: 15000, defaultMaxPerNumber: 2000, formats: ALL },
  front3: { code: "front3", digits: 3, defaultRate100: 45000, defaultMaxPerNumber: 2000, formats: ["thai_gov"] },
  bottom3: { code: "bottom3", digits: 3, defaultRate100: 45000, defaultMaxPerNumber: 2000, formats: ["thai_gov"] },
  top2: { code: "top2", digits: 2, defaultRate100: 9500, defaultMaxPerNumber: 2000, formats: ALL },
  bottom2: { code: "bottom2", digits: 2, defaultRate100: 9500, defaultMaxPerNumber: 2000, formats: ALL },
  runTop: { code: "runTop", digits: 1, defaultRate100: 320, defaultMaxPerNumber: 5000, formats: ALL },
  runBottom: { code: "runBottom", digits: 1, defaultRate100: 420, defaultMaxPerNumber: 5000, formats: ALL },
};

export const BET_TYPE_ORDER: readonly BetTypeCode[] = [
  "top4",
  "top3",
  "tod3",
  "front3",
  "bottom3",
  "top2",
  "bottom2",
  "runTop",
  "runBottom",
];

export function betTypesFor(format: ResultFormat): BetTypeCode[] {
  return BET_TYPE_ORDER.filter((code) => BET_TYPES[code].formats.includes(format));
}

export function isValidNumber(code: BetTypeCode, n: string): boolean {
  return new RegExp(`^[0-9]{${BET_TYPES[code].digits}}$`).test(n);
}

export function isBetTypeCode(x: unknown): x is BetTypeCode {
  return typeof x === "string" && (BET_TYPE_ORDER as readonly string[]).includes(x);
}

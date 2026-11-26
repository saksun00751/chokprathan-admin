import type { SlipLine } from "./quote";
import type { BetTypeCode } from "./types";

/** Ways of entering many numbers at once. Everything ends up as ordinary slip lines. */

export type PairKind = "low" | "high" | "odd" | "even";

/** Two-digit numbers of one kind: low 00–49, high 50–99, odd or even by value. */
export function pairGroup(kind: PairKind): string[] {
  const keep: Record<PairKind, (n: number) => boolean> = {
    low: (n) => n < 50,
    high: (n) => n >= 50,
    odd: (n) => n % 2 === 1,
    even: (n) => n % 2 === 0,
  };
  return Array.from({ length: 100 }, (_, n) => n)
    .filter(keep[kind])
    .map((n) => String(n).padStart(2, "0"));
}

export const MAX_PASTE_LINES = 500;
/** The largest stake one slip line may carry, in whole baht. */
export const MAX_STAKE = 1_000_000;

/** The bet types the first and second amount go to, by how many digits the numbers have. */
const TYPES: Record<number, readonly [BetTypeCode, BetTypeCode | null]> = {
  1: ["runTop", "runBottom"],
  2: ["top2", "bottom2"],
  3: ["top3", "tod3"],
  4: ["top4", null],
};

/** "format": cannot be read. "amount": over `MAX_STAKE`. "limit": would pass `MAX_PASTE_LINES`. */
export type PasteErrorReason = "format" | "amount" | "limit";

export interface PasteError {
  /** from 1, blank lines counted */
  line: number;
  text: string;
  reason: PasteErrorReason;
}

/** The slip lines of one text line, or why nothing can be taken from it. */
function readLine(text: string): SlipLine[] | "format" | "amount" {
  const parts = text.split("=");
  if (parts.length !== 2) return "format";
  const numbers = parts[0].split(/[\s,]+/).filter(Boolean);
  const amounts = parts[1].trim().split(/\s*[xX×]\s*/);
  if (numbers.length === 0 || amounts.length > 2 || !amounts.every((a) => /^\d+$/.test(a))) return "format";
  const digits = numbers[0].length;
  const types = TYPES[digits];
  if (!types || !numbers.every((n) => n.length === digits && /^\d+$/.test(n))) return "format";
  if (amounts.length === 2 && types[1] === null) return "format";
  const stakes = amounts.map(Number);
  if (stakes.every((s) => s === 0)) return "format";
  if (stakes.some((s) => s > MAX_STAKE)) return "amount";
  return numbers.flatMap((number) =>
    stakes.flatMap((stake, i) => {
      const betType = types[i];
      return stake > 0 && betType ? [{ betType, number, stake }] : [];
    }),
  );
}

/**
 * Read pasted text, one entry per line: `<numbers…> = <amount>[x<second amount>]`, e.g. `12 34 = 50x20`
 * (top 50, bottom 20; for three digits the second amount is โต๊ด). A line that cannot be read is
 * reported and contributes nothing: nothing is skipped silently.
 */
export function parseSlipText(text: string): { lines: SlipLine[]; errors: PasteError[] } {
  const lines: SlipLine[] = [];
  const errors: PasteError[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const read = readLine(line);
    if (typeof read === "string") errors.push({ line: i + 1, text: line, reason: read });
    else if (lines.length + read.length > MAX_PASTE_LINES) errors.push({ line: i + 1, text: line, reason: "limit" });
    else lines.push(...read);
  });
  return { lines, errors };
}

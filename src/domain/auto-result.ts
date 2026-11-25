import type { LottoGroup } from "./types";

/**
 * Only house-run games may draw themselves. Every other lottery has an official result that staff
 * enter; a random draw there would pay real money on made-up numbers.
 */
export const mayAutoResult = (group: LottoGroup) => group === "yiki";

/** The same rule in SQL, for queries that join lottos as `l`. */
export const SELF_DRAWN_SQL = "(l.auto_result = 1 AND l.grp = 'yiki')";

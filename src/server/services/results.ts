import "server-only";
import { deriveResult, isWinning, type ResultInput } from "chokprathan-core/rules/match";
import type { BetTypeCode, ResultFormat, RoundResult } from "chokprathan-core/rules/types";
import { errorsT, serverI18n } from "@/i18n/server";
import { json, q, q1, run, tx } from "@/server/db";
import { audit } from "./audit";
import { getLotto } from "./lottos";
import { getRound, invalidateRoundViews, payRound, type RoundRow } from "./rounds";

/**
 * Official results take two people: one types the result, another types it again without seeing it,
 * and only a match pays. The typed digits stay in `round_results` until then: never on the round,
 * in the audit log or in anything sent to a browser.
 */

export type ResultField = "top3" | "bottom2" | "top4" | "first6" | "front3" | "back3";

/** The boxes staff fill in, per format; everything else is derived from them. */
const ENTERED: Record<ResultFormat, ResultField[]> = {
  standard: ["top3", "bottom2"],
  laos4: ["top4"],
  thai_gov: ["first6", "front3", "back3", "bottom2"],
};

/** The two front or back numbers win in either order. */
const comparable = (v: string | string[] | undefined) => (Array.isArray(v) ? [...v].sort().join(",") : v);

/** The boxes whose values differ between two results of one format. */
export const differingFields = (format: ResultFormat, a: RoundResult, b: RoundResult): ResultField[] =>
  ENTERED[format].filter((f) => comparable(a[f]) !== comparable(b[f]));

export type Refusal =
  | { ok: false; error: string; reason: "refused" | "sameUser" }
  | { ok: false; error: string; reason: "mismatch"; fields: ResultField[] };

export interface PayoutPreview {
  bills: number;
  winners: number;
  /** satang */
  payout: number;
}

const refused = (error: string): Refusal => ({ ok: false, error, reason: "refused" });

/** The round with its lottery, and the typed input turned into a result. */
async function prepare(roundId: number, input: ResultInput) {
  const { t } = await serverI18n();
  const e = t.errors;
  const round = await getRound(roundId);
  if (!round) return { ok: false as const, refusal: refused(e.rounds.notFound) };
  const lotto = await getLotto(round.lottoId);
  if (!lotto) return { ok: false as const, refusal: refused(e.rounds.lottoNotFound) };
  const derived = deriveResult(lotto.format, input, e.result);
  if (!derived.ok) return { ok: false as const, refusal: refused(derived.error) };
  return { ok: true as const, e, format: lotto.format, result: derived.result };
}

const lockRound = (roundId: number) => q1<RoundRow>("SELECT * FROM rounds WHERE id = ? FOR UPDATE", roundId);

const pendingOf = (roundId: number) =>
  q1<{ id: number; result: string; entered_by: number | null }>(
    "SELECT id, result, entered_by FROM round_results WHERE round_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    roundId,
  );

/** First person: store the result and make the round wait for a second one. */
export async function enterResult(roundId: number, input: ResultInput, actorId: number, now = Date.now()): Promise<{ ok: true } | Refusal> {
  const p = await prepare(roundId, input);
  if (!p.ok) return p.refusal;
  const { e } = p;
  const outcome = await tx(async (): Promise<{ ok: true } | Refusal> => {
    const locked = await lockRound(roundId);
    if (!locked) return refused(e.rounds.notFound);
    if (locked.status === "cancelled") return refused(e.rounds.cancelled);
    if (locked.status === "resulted") return refused(e.rounds.resulted);
    if (locked.status === "pending_confirm") return refused(e.rounds.pendingAlready);
    if (now < locked.closes_at) return refused(e.rounds.notClosed);
    await run("INSERT INTO round_results (round_id, result, entered_by, entered_at) VALUES (?, ?, ?, ?)", roundId, json.str(p.result), actorId, now);
    await run("UPDATE rounds SET status = 'pending_confirm' WHERE id = ?", roundId);
    await audit(actorId, "round.result.enter", `round:${roundId}`, undefined, now);
    return { ok: true };
  });
  if (outcome.ok) invalidateRoundViews(roundId);
  return outcome;
}

type Match = { ok: true; id: number; enteredBy: number | null; result: RoundResult };

/** Second person: compare what they typed with the waiting result. Differences are logged by box name only. */
async function secondEntry(roundId: number, p: Extract<Awaited<ReturnType<typeof prepare>>, { ok: true }>, actorId: number, now: number): Promise<Match | Refusal> {
  const pending = await pendingOf(roundId);
  const first = pending && json.parse<RoundResult | null>(pending.result, null);
  if (!pending || !first) return refused(p.e.rounds.notPending);
  if (pending.entered_by === actorId) return { ok: false, error: p.e.rounds.sameUser, reason: "sameUser" };
  const fields = differingFields(p.format, first, p.result);
  if (fields.length) {
    await audit(actorId, "round.result.mismatch", `round:${roundId}`, { fields }, now);
    return { ok: false, error: p.e.rounds.mismatch, reason: "mismatch", fields };
  }
  return { ok: true, id: pending.id, enteredBy: pending.entered_by, result: first };
}

/** What paying this result would do to the round's pending bills. */
async function previewPayout(roundId: number, result: RoundResult): Promise<PayoutPreview> {
  const bills = (await q1<{ n: number }>("SELECT COUNT(*) AS n FROM bills WHERE round_id = ? AND status = 'pending'", roundId))!.n;
  const numbers = await q<{ bet_type: BetTypeCode; number: string; payout: number | string }>(
    "SELECT bet_type, number, SUM(potential) AS payout FROM bill_items WHERE round_id = ? AND status = 'pending' GROUP BY bet_type, number",
    roundId,
  );
  const hits = numbers.filter((n) => isWinning(n.bet_type, n.number, result));
  if (hits.length === 0) return { bills, winners: 0, payout: 0 };
  const winners = (await q1<{ n: number }>(
    `SELECT COUNT(DISTINCT bill_id) AS n FROM bill_items WHERE round_id = ? AND status = 'pending' AND (${hits.map(() => "(bet_type = ? AND number = ?)").join(" OR ")})`,
    roundId,
    ...hits.flatMap((h) => [h.bet_type, h.number]),
  ))!.n;
  return { bills, winners, payout: hits.reduce((s, h) => s + Number(h.payout), 0) };
}

/** Compare without paying, and show what confirming would do. */
export async function checkResult(roundId: number, input: ResultInput, actorId: number, now = Date.now()): Promise<{ ok: true; preview: PayoutPreview } | Refusal> {
  const p = await prepare(roundId, input);
  if (!p.ok) return p.refusal;
  const match = await secondEntry(roundId, p, actorId, now);
  if (!match.ok) return match;
  return { ok: true, preview: await previewPayout(roundId, match.result) };
}

/** Second person confirms: the round gets its result and every bill is paid. */
export async function confirmResult(roundId: number, input: ResultInput, actorId: number, now = Date.now()): Promise<{ ok: true } | Refusal> {
  const p = await prepare(roundId, input);
  if (!p.ok) return p.refusal;
  const outcome = await tx(async (): Promise<{ ok: true } | Refusal> => {
    // The round lock first: of two confirmations only one still finds it waiting.
    const locked = await lockRound(roundId);
    if (locked?.status !== "pending_confirm") return refused(p.e.rounds.notPending);
    const match = await secondEntry(roundId, p, actorId, now);
    if (!match.ok) return match;
    await run("UPDATE round_results SET status = 'confirmed', confirmed_by = ?, confirmed_at = ? WHERE id = ?", actorId, now, match.id);
    await run("UPDATE rounds SET status = 'resulted', result = ?, resulted_at = ?, resulted_by = ? WHERE id = ?", json.str(match.result), now, actorId, roundId);
    await audit(actorId, "round.result", `round:${roundId}`, { ...match.result, enteredBy: match.enteredBy }, now);
    return { ok: true };
  });
  if (!outcome.ok) return outcome;
  invalidateRoundViews(roundId);
  await payRound(roundId, now);
  return outcome;
}

/** Throw the waiting result away so it can be typed again. `ownOnly`: only whoever typed it (a withdrawal). */
export async function rejectResult(
  roundId: number,
  actorId: number,
  { ownOnly }: { ownOnly: boolean },
  now = Date.now(),
): Promise<{ ok: true } | Refusal> {
  const e = await errorsT();
  const outcome = await tx(async (): Promise<{ ok: true } | Refusal> => {
    const locked = await lockRound(roundId);
    const pending = locked?.status === "pending_confirm" ? await pendingOf(roundId) : undefined;
    if (!pending) return refused(e.rounds.notPending);
    if (ownOnly && pending.entered_by !== actorId) return refused(e.rounds.withdrawNotYours);
    await run("UPDATE round_results SET status = 'rejected', confirmed_by = ?, confirmed_at = ? WHERE id = ?", actorId, now, pending.id);
    await run("UPDATE rounds SET status = 'scheduled' WHERE id = ?", roundId);
    await audit(actorId, "round.result.reject", `round:${roundId}`, { enteredBy: pending.entered_by }, now);
    return { ok: true };
  });
  if (outcome.ok) invalidateRoundViews(roundId);
  return outcome;
}

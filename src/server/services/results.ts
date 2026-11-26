import "server-only";
import { deriveResult, isWinning, type ResultInput } from "@/core/rules/match";
import type { BetTypeCode, ResultFormat, RoundResult } from "@/core/rules/types";
import { errorsT, serverI18n } from "@/i18n/server";
import { json, q, q1, run, tx } from "@/server/db";
import { audit } from "./audit";
import { getLotto } from "./lottos";
import { getRound, invalidateRoundViews, payRound, type RoundRow } from "./rounds";

/**
 * Official results are typed by one person, who sees what they will pay and confirms. Typing and
 * paying are one step: no result waits in between.
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

export type Refusal = { ok: false; error: string };

export interface PayoutPreview {
  bills: number;
  winners: number;
  /** satang */
  payout: number;
}

const refused = (error: string): Refusal => ({ ok: false, error });

type Errors = Awaited<ReturnType<typeof errorsT>>;

/** Why this round cannot take a result now, if it cannot. */
function closedFor(status: RoundRow["status"], closesAt: number, e: Errors, now: number): Refusal | null {
  if (status === "cancelled") return refused(e.rounds.cancelled);
  if (status === "resulted") return refused(e.rounds.resulted);
  if (now < closesAt) return refused(e.rounds.notClosed);
  return null;
}

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
  return { ok: true as const, e, round, result: derived.result };
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

/** Show what this result would pay. Writes nothing. */
export async function previewResult(roundId: number, input: ResultInput, now = Date.now()): Promise<{ ok: true; preview: PayoutPreview } | Refusal> {
  const p = await prepare(roundId, input);
  if (!p.ok) return p.refusal;
  return closedFor(p.round.status, p.round.closesAt, p.e, now) ?? { ok: true, preview: await previewPayout(roundId, p.result) };
}

/** The round gets its result and every bill is paid. */
export async function submitResult(roundId: number, input: ResultInput, actorId: number, now = Date.now()): Promise<{ ok: true } | Refusal> {
  const p = await prepare(roundId, input);
  if (!p.ok) return p.refusal;
  const outcome = await tx(async (): Promise<{ ok: true } | Refusal> => {
    // The round lock first: of two submissions only one still finds it without a result.
    const locked = await q1<RoundRow>("SELECT * FROM rounds WHERE id = ? FOR UPDATE", roundId);
    if (!locked) return refused(p.e.rounds.notFound);
    const closed = closedFor(locked.status, locked.closes_at, p.e, now);
    if (closed) return closed;
    // A result left waiting by the old two-person check is replaced by this one.
    await run("UPDATE round_results SET status = 'superseded' WHERE round_id = ? AND status = 'pending'", roundId);
    await run(
      "INSERT INTO round_results (round_id, result, status, entered_by, entered_at, confirmed_by, confirmed_at) VALUES (?, ?, 'confirmed', ?, ?, ?, ?)",
      roundId,
      json.str(p.result),
      actorId,
      now,
      actorId,
      now,
    );
    await run("UPDATE rounds SET status = 'resulted', result = ?, resulted_at = ?, resulted_by = ? WHERE id = ?", json.str(p.result), now, actorId, roundId);
    await audit(actorId, "round.result", `round:${roundId}`, p.result, now);
    return { ok: true };
  });
  if (!outcome.ok) return outcome;
  invalidateRoundViews(roundId);
  await payRound(roundId, now);
  return outcome;
}

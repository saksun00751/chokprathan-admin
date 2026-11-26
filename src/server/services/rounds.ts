import "server-only";
import { scheduledClose } from "@/i18n/labels";
import { settleGuesses } from "./activities";
import { errorsT, serverI18n } from "@/i18n/server";
import { randomInt } from "node:crypto";
import { SELF_DRAWN_SQL } from "@/domain/auto-result";
import { deriveResult, type ResultInput } from "chokprathan-core/rules/match";
import { roundTimesProblem, type RoundTimes, type RoundTimesProblem } from "@/domain/round-input";
import { closesForDay, nextClose, opensOnDay, previousClose } from "chokprathan-core/rules/schedule";
import { DAY, addDays, dayKey, formatThaiDate } from "chokprathan-core/rules/time";
import type { ResultFormat, RoundResult } from "chokprathan-core/rules/types";
import { invalidate } from "@/server/cache";
import { afterCommit, json, q, q1, run, tx, type SqlValue } from "@/server/db";
import { audit } from "./audit";
import { applyCorrection } from "./correction";
import { settlePending } from "./settlement";
import { getLotto, listLottos, type Lotto } from "./lottos";

export type RoundStatus = "scheduled" | "pending_confirm" | "resulted" | "cancelled";
export type RoundPhase = "upcoming" | "open" | "closed" | "confirming" | "resulted" | "cancelled";

export interface Round {
  id: number;
  lottoId: number;
  roundNo: number | null;
  dayKey: string;
  opensAt: number;
  closesAt: number;
  /** set when the draw was closed early: its scheduled closing time */
  plannedClose: number | null;
  drawAt: number;
  status: RoundStatus;
  result: RoundResult | null;
  resultedAt: number | null;
  settledAt: number | null;
}

export interface RoundRow {
  id: number;
  lotto_id: number;
  round_no: number | null;
  day_key: string;
  opens_at: number;
  closes_at: number;
  planned_close: number | null;
  draw_at: number;
  status: RoundStatus;
  result: string | null;
  resulted_at: number | null;
  resulted_by?: number | null;
  settled_at: number | null;
}

export function toRound(r: RoundRow): Round {
  return {
    id: r.id,
    lottoId: r.lotto_id,
    roundNo: r.round_no,
    dayKey: r.day_key,
    opensAt: r.opens_at,
    closesAt: r.closes_at,
    plannedClose: r.planned_close ?? null,
    drawAt: r.draw_at,
    status: r.status,
    result: json.parse<RoundResult | null>(r.result, null),
    resultedAt: r.resulted_at,
    settledAt: r.settled_at,
  };
}

export function phaseOf(r: Pick<Round, "opensAt" | "closesAt" | "status">, now: number): RoundPhase {
  if (r.status === "cancelled") return "cancelled";
  if (r.status === "resulted") return "resulted";
  if (r.status === "pending_confirm") return "confirming";
  if (now < r.opensAt) return "upcoming";
  if (now < r.closesAt) return "open";
  return "closed";
}

export function roundLabel(r: Pick<Round, "roundNo" | "closesAt" | "plannedClose">): string {
  return r.roundNo != null ? `รอบที่ ${r.roundNo}` : `งวด ${formatThaiDate(scheduledClose(r))}`;
}

export async function getRound(id: number): Promise<Round | undefined> {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  const row = await q1<RoundRow>("SELECT * FROM rounds WHERE id = ?", id);
  return row && toRound(row);
}

type Planned = { lotto: Lotto; roundNo: number | null; key: string; opensAt: number; closesAt: number };

function plannedRounds(lottos: Lotto[], now: number, daysBack: number, daysAhead: number): Planned[] {
  const today = dayKey(now);
  const keys = Array.from({ length: daysBack + daysAhead + 1 }, (_, i) => addDays(today, i - daysBack));
  const out: Planned[] = [];
  for (const lotto of lottos) {
    const s = lotto.schedule;
    if (s.kind === "interval") {
      for (const key of keys) {
        const closes = closesForDay(s, key);
        if (closes.length === 0) continue;
        const opensAt = opensOnDay(s, key) ?? previousClose(s, closes[0]) ?? closes[0] - s.everyMin * 60_000;
        closes.forEach((c, i) => out.push({ lotto, roundNo: i + 1, key, opensAt, closesAt: c }));
      }
      continue;
    }
    const closes = keys.flatMap((key) => closesForDay(s, key).map((c) => ({ key, c })));
    // Draws that are weeks away (monthly) still need their round now, so members can bet early.
    if (!closes.some(({ c }) => c > now)) {
      const upcoming = nextClose(s, now);
      if (upcoming !== null) closes.push({ key: dayKey(upcoming), c: upcoming });
    }
    closes.forEach(({ key, c }, i) => {
      const opensAt = opensOnDay(s, key) ?? (i > 0 ? closes[i - 1].c : (previousClose(s, c) ?? c - DAY));
      out.push({ lotto, roundNo: null, key, opensAt, closesAt: c });
    });
  }
  return out;
}

/**
 * Make sure every scheduled round from `daysBack` days ago to `daysAhead` days ahead exists.
 * Weekly/monthly rounds open when the previous draw closes. Interval (Yiki) rounds of a day
 * all open when the previous day's last round closes. Only missing rounds are inserted.
 */
export async function ensureRounds(now: number, { daysBack = 1, daysAhead = 1 } = {}): Promise<number> {
  const lottos = (await listLottos()).filter((l) => l.autoRounds);
  const planned = plannedRounds(lottos, now, daysBack, daysAhead);
  if (planned.length === 0) return 0;
  const from = Math.min(...planned.map((p) => p.closesAt));
  const to = Math.max(...planned.map((p) => p.closesAt));
  // A round closed early still occupies its planned time.
  const existing = await q<{ lotto_id: number; closes_at: number }>(
    "SELECT lotto_id, COALESCE(planned_close, closes_at) AS closes_at FROM rounds WHERE closes_at BETWEEN ? AND ? OR planned_close BETWEEN ? AND ?",
    from,
    to,
    from,
    to,
  );
  const have = new Set(existing.map((r) => `${r.lotto_id}:${r.closes_at}`));
  const missing = planned.filter((p) => !have.has(`${p.lotto.id}:${p.closesAt}`));
  let inserted = 0;
  for (let i = 0; i < missing.length; i += 400) {
    const part = missing.slice(i, i + 400);
    const values: SqlValue[] = part.flatMap((p) => [p.lotto.id, p.roundNo, p.key, p.opensAt, p.closesAt, p.closesAt + p.lotto.resultDelayMin * 60_000]);
    // IGNORE: another instance may insert the same round at the same moment (UNIQUE lotto_id, closes_at).
    inserted += (
      await run(
        `INSERT IGNORE INTO rounds (lotto_id, round_no, day_key, opens_at, closes_at, draw_at) VALUES ${part.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
        ...values,
      )
    ).changes;
  }
  if (inserted > 0) invalidate("lobby");
  return inserted;
}

/**
 * After a lotto's schedule or result delay changed, bring its future rounds in line with the new plan.
 * Only rounds nobody has touched are changed: still scheduled, closing in the future, no bills and no
 * point guesses. Those that match a planned close get their open/draw times (and round number) updated;
 * those the new schedule no longer has are cancelled (admin may not DELETE rounds, and a cancelled
 * round with no bills refunds nothing). Rounds with bills or guesses keep their original times.
 * A future round an earlier schedule change cancelled is reopened when the plan has it again;
 * rounds staff cancelled stay cancelled. Rounds staff created are never touched, and a lottery whose
 * automatic round creation is off keeps every round as it is.
 * Missing rounds of the new plan are created by the `ensureRounds` call at the end.
 */
export async function reconcileRounds(lottoId: number, actorId: number | null, now = Date.now()): Promise<{ updated: number; cancelled: number; reopened: number; created: number }> {
  const lotto = await getLotto(lottoId);
  if (!lotto?.autoRounds) return { updated: 0, cancelled: 0, reopened: 0, created: 0 };
  const plan = new Map(plannedRounds([lotto], now, 1, 1).map((p) => [p.closesAt, p]));
  const untouched = await q<{ id: number; closes_at: number; round_no: number | null; day_key: string; opens_at: number; draw_at: number }>(
    `SELECT r.id, r.closes_at, r.round_no, r.day_key, r.opens_at, r.draw_at FROM rounds r
     WHERE r.lotto_id = ? AND r.status = 'scheduled' AND r.closes_at > ?
       AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.round_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM point_guesses g WHERE g.round_id = r.id)`,
    lottoId,
    now,
  );
  const manual = await manualRounds(untouched.map((r) => r.id));
  let updated = 0;
  let cancelled = 0;
  for (const r of untouched.filter((x) => !manual.has(x.id))) {
    const want = plan.get(r.closes_at);
    if (!want) {
      if ((await cancelRound(r.id, actorId, now, { by: "schedule" })).ok) cancelled++;
      continue;
    }
    const drawAt = want.closesAt + lotto.resultDelayMin * 60_000;
    if (want.opensAt === r.opens_at && drawAt === r.draw_at && want.roundNo === r.round_no && want.key === r.day_key) continue;
    // Re-check "no bills" in the UPDATE itself: a bill may have landed since the SELECT.
    const { changes } = await run(
      `UPDATE rounds SET opens_at = ?, draw_at = ?, round_no = ?, day_key = ?
       WHERE id = ? AND status = 'scheduled' AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.round_id = rounds.id)`,
      want.opensAt,
      drawAt,
      want.roundNo,
      want.key,
      r.id,
    );
    updated += changes;
  }
  const reopened = await reopenScheduleCancelled(lotto, plan, actorId, now);
  const created = await ensureRounds(now);
  if (updated > 0 || cancelled > 0 || reopened > 0) invalidate("lobby", "results");
  return { updated, cancelled, reopened, created };
}

/** Which of these rounds staff created by hand: their `round.create` audit entry says so. */
async function manualRounds(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await q<{ target: string }>(
    "SELECT target FROM audit_log WHERE action = 'round.create' AND target IN (?)",
    ids.map((id) => `round:${id}`),
  );
  return new Set(rows.map((r) => Number(r.target.slice("round:".length))));
}

export type CreateRoundOutcome = { ok: true; id: number } | { ok: false; error: "lotto" | "duplicate" | RoundTimesProblem };

/** Create one round by hand. The audit entry is written with it, since `reconcileRounds` relies on it. */
export async function createRound(lottoId: number, times: RoundTimes, actorId: number, now = Date.now()): Promise<CreateRoundOutcome> {
  const lotto = await getLotto(lottoId);
  if (!lotto?.enabled) return { ok: false, error: "lotto" };
  const problem = roundTimesProblem(times, now);
  if (problem) return { ok: false, error: problem };
  const key = dayKey(times.closesAt);
  const result = await tx(async (): Promise<CreateRoundOutcome> => {
    // Interval lotteries number their rounds within the day.
    const roundNo =
      lotto.schedule.kind === "interval"
        ? Math.max(
            (await q1<{ n: number | null }>("SELECT MAX(round_no) AS n FROM rounds WHERE lotto_id = ? AND day_key = ? FOR UPDATE", lottoId, key))?.n ?? 0,
            // The scheduler numbers the day's own rounds from 1, whether or not they exist yet, and
            // automatic creation can be switched back on the same day.
            lotto.schedule.count,
          ) + 1
        : null;
    // IGNORE: (lotto_id, closes_at) is unique, cancelled rounds included.
    const { changes, lastId } = await run(
      "INSERT IGNORE INTO rounds (lotto_id, round_no, day_key, opens_at, closes_at, draw_at) VALUES (?, ?, ?, ?, ?, ?)",
      lottoId,
      roundNo,
      key,
      times.opensAt,
      times.closesAt,
      times.drawAt,
    );
    if (!changes) return { ok: false, error: "duplicate" };
    await audit(actorId, "round.create", `round:${lastId}`, { lottoId, ...times }, now);
    return { ok: true, id: lastId };
  });
  if (result.ok) invalidateRoundViews(result.id);
  return result;
}

/**
 * Bring back future rounds that a schedule change cancelled and the plan has again. `ensureRounds`
 * cannot recreate them: the cancelled row still holds (lotto_id, closes_at). The latest
 * `round.cancel` audit entry says who cancelled a round, so a staff cancellation is never undone.
 */
async function reopenScheduleCancelled(lotto: Lotto, plan: Map<number, Planned>, actorId: number | null, now: number): Promise<number> {
  const rows = await q<{ id: number; closes_at: number; detail: string | null }>(
    `SELECT r.id, r.closes_at,
       (SELECT a.detail FROM audit_log a WHERE a.action = 'round.cancel' AND a.target = CONCAT('round:', r.id) ORDER BY a.id DESC LIMIT 1) AS detail
     FROM rounds r
     WHERE r.lotto_id = ? AND r.status = 'cancelled' AND r.settled_at IS NOT NULL AND r.closes_at > ?
       AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.round_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM point_guesses g WHERE g.round_id = r.id)`,
    lotto.id,
    now,
  );
  let reopened = 0;
  for (const r of rows) {
    const want = plan.get(r.closes_at);
    if (!want || json.parse<{ by?: string } | null>(r.detail, null)?.by !== "schedule") continue;
    const changed = await tx(async () => {
      const { changes } = await run(
        `UPDATE rounds SET status = 'scheduled', resulted_at = NULL, resulted_by = NULL, settled_at = NULL,
           opens_at = ?, draw_at = ?, round_no = ?, day_key = ?
         WHERE id = ? AND status = 'cancelled' AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.round_id = rounds.id)`,
        want.opensAt,
        want.closesAt + lotto.resultDelayMin * 60_000,
        want.roundNo,
        want.key,
        r.id,
      );
      if (changes) await audit(actorId, "round.reopen", `round:${r.id}`, undefined, now);
      return changes;
    });
    if (changed) {
      reopened++;
      invalidateRoundViews(r.id);
    }
  }
  return reopened;
}

export type SetResultOutcome ={ ok: true; result: RoundResult } | { ok: false; error: string };

export function invalidateRoundViews(roundId: number) {
  const keys = ["lobby", "results", `limits:${roundId}`];
  invalidate(...keys);
  afterCommit(() => invalidate(...keys));
}

/** Pay a round whose result is stored (or refund a cancelled one), and settle its point guesses. */
export async function payRound(roundId: number, now = Date.now()) {
  await settlePending(roundId, now);
  // Point guesses on this round; if this fails the scheduler retries it.
  await settleGuesses(roundId, now).catch((error) => console.error("[rounds] guess settlement failed:", error instanceof Error ? error.message : error));
}

/**
 * The house game draws itself: no second person, confirmed as the system. Every other lottery's
 * result goes through `services/results`.
 */
export async function drawResult(roundId: number, input: ResultInput, now = Date.now()): Promise<SetResultOutcome> {
  const { t } = await serverI18n();
  const e = t.errors;
  const round = await getRound(roundId);
  if (!round) return { ok: false, error: e.rounds.notFound };
  const lotto = await getLotto(round.lottoId);
  if (!lotto) return { ok: false, error: e.rounds.lottoNotFound };
  if (!lotto.autoResult) return { ok: false, error: e.rounds.notSelfDrawn };
  const derived = deriveResult(lotto.format, input, e.result);
  if (!derived.ok) return derived;

  const marked = await tx(async (): Promise<SetResultOutcome> => {
    const locked = await q1<RoundRow>("SELECT * FROM rounds WHERE id = ? FOR UPDATE", roundId);
    if (!locked) return { ok: false, error: e.rounds.notFound };
    if (locked.status === "cancelled") return { ok: false, error: e.rounds.cancelled };
    // A result typed by staff and waiting for confirmation is left to them.
    if (locked.status !== "scheduled") return { ok: false, error: e.rounds.resulted };
    if (now < locked.closes_at) return { ok: false, error: e.rounds.notClosed };
    await run(
      "INSERT INTO round_results (round_id, result, status, entered_at, confirmed_at) VALUES (?, ?, 'confirmed', ?, ?)",
      roundId,
      json.str(derived.result),
      now,
      now,
    );
    await run("UPDATE rounds SET status = 'resulted', result = ?, resulted_at = ?, resulted_by = NULL WHERE id = ?", json.str(derived.result), now, roundId);
    return { ok: true, result: derived.result };
  });
  if (!marked.ok) return marked;
  invalidateRoundViews(roundId);
  await payRound(roundId, now);
  return marked;
}

/** Cancel a round: every pending bill is refunded in full. */
export async function cancelRound(
  roundId: number,
  actorId: number | null,
  now = Date.now(),
  /** Recorded in the audit entry; `reconcileRounds` uses it to know which rounds it may reopen. */
  detail?: { by: "schedule" },
): Promise<{ ok: boolean; error?: string; refunded?: number }> {
  const e = await errorsT();
  const marked = await tx(async () => {
    const locked = await q1<RoundRow>("SELECT * FROM rounds WHERE id = ? FOR UPDATE", roundId);
    if (!locked) return { ok: false as const, error: e.rounds.notFound };
    if (locked.status !== "scheduled" && locked.status !== "pending_confirm") return { ok: false as const, error: e.rounds.done };
    await run("UPDATE rounds SET status = 'cancelled', resulted_at = ?, resulted_by = ? WHERE id = ?", now, actorId, roundId);
    // A result still waiting for confirmation will never be used.
    if (locked.status === "pending_confirm") await run("UPDATE round_results SET status = 'superseded' WHERE round_id = ? AND status = 'pending'", roundId);
    await audit(actorId, "round.cancel", `round:${roundId}`, detail, now);
    return { ok: true as const };
  });
  if (!marked.ok) return marked;
  invalidateRoundViews(roundId);
  const { bills } = await settlePending(roundId, now);
  // Guesses on a cancelled round get their points back.
  await settleGuesses(roundId, now).catch((error) => console.error("[rounds] guess refund failed:", error instanceof Error ? error.message : error));
  return { ok: true, refunded: bills };
}

/**
 * Stop betting on an open round now (a result came out early, or something is wrong). Accepted bills
 * stay. The planned time is kept so the round is not created again.
 */
export async function closeRoundNow(roundId: number, actorId: number, now = Date.now()): Promise<{ ok: true } | { ok: false; error: "notFound" | "notOpen" }> {
  const outcome = await tx(async () => {
    // Exclusive lock: waits for bets in flight, which hold the row shared.
    const locked = await q1<RoundRow>("SELECT * FROM rounds WHERE id = ? FOR UPDATE", roundId);
    if (!locked) return { ok: false as const, error: "notFound" as const };
    if (locked.status !== "scheduled" || now < locked.opens_at || now >= locked.closes_at) return { ok: false as const, error: "notOpen" as const };
    await run("UPDATE rounds SET planned_close = COALESCE(planned_close, closes_at), closes_at = ? WHERE id = ?", now, roundId);
    await audit(actorId, "round.close", `round:${roundId}`, { plannedClose: locked.closes_at }, now);
    return { ok: true as const };
  });
  if (outcome.ok) invalidateRoundViews(roundId);
  return outcome;
}

const randomDigits = (n: number, rng: () => number) => Array.from({ length: n }, () => Math.floor(rng() * 10)).join("");

const cryptoRng = () => randomInt(0, 1_000_000) / 1_000_000;

/** A fair random draw. Used for the house game (Yiki) and for demo installs. */
export function randomResult(format: ResultFormat, rng: () => number = cryptoRng): ResultInput {
  switch (format) {
    case "standard":
      return { top3: randomDigits(3, rng), bottom2: randomDigits(2, rng) };
    case "laos4":
      return { top4: randomDigits(4, rng) };
    case "thai_gov":
      return {
        first6: randomDigits(6, rng),
        front3: [randomDigits(3, rng), randomDigits(3, rng)],
        back3: [randomDigits(3, rng), randomDigits(3, rng)],
        bottom2: randomDigits(2, rng),
      };
  }
}

const logRoundFailure = (what: string, roundId: number, error: unknown) =>
  console.error(`[rounds] ${what} failed for round ${roundId}:`, error instanceof Error ? error.message : error);

/** Draw and settle every auto-result round whose draw time has passed. One failing round does not stop the others. */
export async function autoResults(now: number, limit = 200): Promise<number> {
  const due = await q<{ id: number; format: ResultFormat }>(
    `SELECT r.id, l.format FROM rounds r JOIN lottos l ON l.id = r.lotto_id
     WHERE r.status = 'scheduled' AND r.draw_at <= ? AND ${SELF_DRAWN_SQL}
     ORDER BY r.draw_at LIMIT ?`,
    now,
    limit,
  );
  let drawn = 0;
  for (const r of due) {
    try {
      if ((await drawResult(r.id, randomResult(r.format), now)).ok) drawn++;
    } catch (error) {
      logRoundFailure("auto result", r.id, error);
    }
  }
  return drawn;
}

/** Finish paying or refunding rounds whose settlement was interrupted. One failing round does not stop the others. */
export async function resumeSettlements(now: number): Promise<number> {
  const open = await q<{ id: number }>(
    `SELECT r.id FROM rounds r WHERE r.status IN ('resulted','cancelled') AND r.settled_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM settlement_runs s WHERE s.round_id = r.id AND s.status = 'mismatch')
     ORDER BY r.resulted_at LIMIT 20`,
  );
  let settled = 0;
  for (const r of open) {
    try {
      // A confirmed correction is finished by its own engine; each of the two ignores the other's rounds.
      await applyCorrection(r.id, now);
      await settlePending(r.id, now);
      settled++;
    } catch (error) {
      logRoundFailure("settlement", r.id, error);
    }
  }
  return settled;
}

import "server-only";
import { deriveResult, type ResultInput } from "@/core/rules/match";
import type { RoundResult } from "@/core/rules/types";
import { collectDebt } from "@/core/wallet/debt";
import { entitled, settleLines, type EntitledItem, type Line, type Rewards, type Wallets } from "@/domain/entitlement";
import { errorsT, serverI18n } from "@/i18n/server";
import { invalidate } from "@/server/cache";
import { afterCommit, insertMany, json, q, q1, run, tx } from "@/server/db";
import { audit } from "./audit";
import { getLotto } from "./lottos";
import { differingFields, type Refusal } from "./results";

/**
 * Correcting a paid result (a new result, or voiding the round) takes two people. Money is adjusted by
 * the difference between what each bill entitled whom to and what it entitles them to now, one member
 * per transaction. Old ledger rows are never edited; what cannot be taken back becomes a debt.
 */

export type Change = { kind: "correction"; input: ResultInput } | { kind: "cancel" };

export interface CorrectionPreview {
  members: { userId: number; name: string; change: number; shortfall: number }[];
  change: number;
  shortfall: number;
}

const refused = (error: string): Refusal => ({ ok: false, error, reason: "refused" });

function invalidateViews(roundId: number) {
  const keys = ["lobby", "results", `limits:${roundId}`];
  invalidate(...keys);
  afterCommit(() => invalidate(...keys));
}

type RoundState = { status: string; result: string | null; settled_at: number | null; lotto_id: number };
const roundState = (roundId: number, lock = false) =>
  q1<RoundState>(`SELECT status, result, settled_at, lotto_id FROM rounds WHERE id = ?${lock ? " FOR UPDATE" : ""}`, roundId);

type Run = { id: number; kind: "result" | "cancel" | "correction" | "void"; status: "running" | "done" | "mismatch"; round_result_id: number | null; rewards: string | null };
const lastRun = (roundId: number) =>
  q1<Run>("SELECT id, kind, status, round_result_id, rewards FROM settlement_runs WHERE round_id = ? ORDER BY id DESC LIMIT 1", roundId);

type Pending = { id: number; kind: "correction" | "cancel"; result: string | null; entered_by: number | null; reason: string | null };
const pendingChange = (roundId: number) =>
  q1<Pending>(
    "SELECT id, kind, result, entered_by, reason FROM round_results WHERE round_id = ? AND status = 'pending' AND kind IN ('correction','cancel') ORDER BY id DESC LIMIT 1",
    roundId,
  );

/** The finished payout a correction would start from, or why the round cannot be corrected. */
async function correctable(roundId: number, e: Awaited<ReturnType<typeof errorsT>>, lock = false) {
  const round = await roundState(roundId, lock);
  if (!round) return { ok: false as const, refusal: refused(e.rounds.notFound) };
  const run = await lastRun(roundId);
  if (round.status !== "resulted" || round.settled_at === null || run?.status !== "done") return { ok: false as const, refusal: refused(e.rounds.notCorrectable) };
  const unrecorded = await q1("SELECT id FROM bills WHERE round_id = ? AND status IN ('won','lost') AND (cashback_paid IS NULL OR turnover_taken IS NULL) LIMIT 1", roundId);
  const rewards = json.parse<Rewards | null>(run.rewards, null);
  if (unrecorded || !rewards) return { ok: false as const, refusal: refused(e.rounds.tooOld) };
  return { ok: true as const, round, rewards };
}

/** First person: ask for a new result or to void the round, saying why. Nothing moves yet. */
export async function requestCorrection(roundId: number, change: Change, reason: string, actorId: number, now = Date.now()): Promise<{ ok: true } | Refusal> {
  const { t } = await serverI18n();
  const e = t.errors;
  const why = reason.trim().slice(0, 255);
  if (why.length < 3) return refused(e.rounds.reasonRequired);
  return tx(async (): Promise<{ ok: true } | Refusal> => {
    const base = await correctable(roundId, e, true);
    if (!base.ok) return base.refusal;
    if (await q1("SELECT id FROM round_results WHERE round_id = ? AND status = 'pending' LIMIT 1", roundId)) return refused(e.rounds.correctionPending);
    let result: RoundResult | null = null;
    if (change.kind === "correction") {
      const lotto = await getLotto(base.round.lotto_id);
      if (!lotto) return refused(e.rounds.lottoNotFound);
      const derived = deriveResult(lotto.format, change.input, e.result);
      if (!derived.ok) return refused(derived.error);
      const current = json.parse<RoundResult | null>(base.round.result, null);
      if (current && differingFields(lotto.format, current, derived.result).length === 0) return refused(e.rounds.sameResult);
      result = derived.result;
    }
    await run(
      "INSERT INTO round_results (round_id, kind, result, entered_by, entered_at, reason) VALUES (?, ?, ?, ?, ?, ?)",
      roundId,
      change.kind,
      result ? json.str(result) : null,
      actorId,
      now,
      why,
    );
    await audit(actorId, "round.correction.request", `round:${roundId}`, { kind: change.kind, reason: why }, now);
    return { ok: true };
  });
}

type Approval = { ok: true; pending: Pending; target: RoundResult | "void" } | Refusal;

/** Second person: another account, who retypes a new result without seeing it (a void needs only approval). */
async function approval(roundId: number, requestId: number, input: ResultInput | null, actorId: number, now: number): Promise<Approval> {
  const { t } = await serverI18n();
  const e = t.errors;
  const pending = await pendingChange(roundId);
  if (!pending) return refused(e.rounds.noCorrection);
  // Withdrawn and replaced since the page was opened: what was read is not what would be applied.
  if (pending.id !== requestId) return refused(e.rounds.correctionChanged);
  if (pending.entered_by === actorId) return { ok: false, error: e.rounds.sameUser, reason: "sameUser" };
  if (pending.kind === "cancel") return { ok: true, pending, target: "void" };
  const round = await roundState(roundId);
  const lotto = round && (await getLotto(round.lotto_id));
  const first = json.parse<RoundResult | null>(pending.result, null);
  if (!lotto || !first) return refused(e.rounds.noCorrection);
  const derived = deriveResult(lotto.format, input ?? {}, e.result);
  if (!derived.ok) return refused(derived.error);
  const fields = differingFields(lotto.format, first, derived.result);
  if (fields.length) {
    await audit(actorId, "round.result.mismatch", `round:${roundId}`, { fields }, now);
    return { ok: false, error: e.rounds.mismatch, reason: "mismatch", fields };
  }
  return { ok: true, pending, target: first };
}

type BillRow = {
  id: number;
  code: string;
  user_id: number;
  total_stake: number;
  total_payout: number;
  cashback_paid: number;
  turnover_taken: number;
  aff1_user: number | null;
  aff1_paid: number;
  aff2_user: number | null;
  aff2_paid: number;
};
type ItemRow = EntitledItem & { id: number; bill_id: number };

type MemberPlan = { lines: Line[]; turnover: number };

/** What changes for every member, and what each bill will say afterwards. Reads only. */
async function planChange(roundId: number, target: RoundResult | "void", rewards: Rewards) {
  const [bills, items] = await Promise.all([
    q<BillRow>(
      `SELECT id, code, user_id, total_stake, total_payout, cashback_paid, turnover_taken, aff1_user, aff1_paid, aff2_user, aff2_paid
       FROM bills WHERE round_id = ? AND status IN ('won','lost') ORDER BY id`,
      roundId,
    ),
    q<ItemRow>("SELECT id, bill_id, bet_type, number, stake, discount, potential FROM bill_items WHERE round_id = ? AND status IN ('won','lost') ORDER BY id", roundId),
  ]);
  const itemsByBill = new Map<number, ItemRow[]>();
  for (const it of items) itemsByBill.set(it.bill_id, [...(itemsByBill.get(it.bill_id) ?? []), it]);

  const members = new Map<number, MemberPlan>();
  const of = (userId: number) => {
    let plan = members.get(userId);
    if (!plan) members.set(userId, (plan = { lines: [], turnover: 0 }));
    return plan;
  };
  const after = bills.map((bill) => {
    const own = itemsByBill.get(bill.id) ?? [];
    const now = entitled(bill.total_stake, own, target, rewards, { aff1: bill.aff1_user !== null, aff2: bill.aff2_user !== null });
    const add = (userId: number | null, wallet: Line["wallet"], type: Line["type"], amount: number) => {
      if (userId !== null && amount !== 0) of(userId).lines.push({ ref: bill.code, wallet, type, amount });
    };
    add(bill.user_id, "balance", "win_correction", now.payout - bill.total_payout);
    add(bill.user_id, "balance", "refund", now.refund);
    add(bill.user_id, "cashback", "cashback_correction", now.cashback - bill.cashback_paid);
    add(bill.aff1_user, "affiliate", "aff_correction", now.aff1 - bill.aff1_paid);
    add(bill.aff2_user, "affiliate", "aff_correction", now.aff2 - bill.aff2_paid);
    // Voiding puts back what the payout counted off, which can be less than the stake.
    if (target === "void") of(bill.user_id).turnover += bill.turnover_taken;
    return { bill, now, items: own };
  });
  return { members, after };
}

const walletsOf = async (userId: number, lock: boolean): Promise<Wallets> => {
  const u = (await q1<{ balance: number; cashback_balance: number; affiliate_balance: number }>(
    `SELECT balance, cashback_balance, affiliate_balance FROM users WHERE id = ?${lock ? " FOR UPDATE" : ""}`,
    userId,
  ))!;
  return { balance: u.balance, cashback: u.cashback_balance, affiliate: u.affiliate_balance };
};

const total = (lines: Line[]) => lines.reduce((s, l) => s + l.amount, 0);

/** Compare without applying, and show who gains, who pays back and who cannot. */
export async function checkCorrection(
  roundId: number,
  requestId: number,
  input: ResultInput | null,
  actorId: number,
  now = Date.now(),
): Promise<{ ok: true; preview: CorrectionPreview } | Refusal> {
  const second = await approval(roundId, requestId, input, actorId, now);
  if (!second.ok) return second;
  const base = await correctable(roundId, await errorsT());
  if (!base.ok) return base.refusal;
  const { members } = await planChange(roundId, second.target, base.rewards);
  const changed = [...members].filter(([, p]) => p.lines.length > 0);
  const names = changed.length
    ? new Map((await q<{ id: number; name: string }>("SELECT id, name FROM users WHERE id IN (?)", changed.map(([id]) => id))).map((u) => [u.id, u.name]))
    : new Map<number, string>();
  const rows: CorrectionPreview["members"] = [];
  for (const [userId, plan] of changed) {
    const { shortfall } = settleLines(await walletsOf(userId, false), plan.lines);
    rows.push({ userId, name: names.get(userId) ?? "", change: total(plan.lines), shortfall });
  }
  rows.sort((a, b) => b.shortfall - a.shortfall || a.change - b.change);
  return {
    ok: true,
    preview: { members: rows, change: rows.reduce((s, r) => s + r.change, 0), shortfall: rows.reduce((s, r) => s + r.shortfall, 0) },
  };
}

export interface ApplyHooks {
  /** Tests use this to interrupt a run: called before the n-th member (from 0). */
  onMember?: (n: number) => void;
}

/** Second person approves: the round takes its new state and the money is adjusted. */
export async function confirmCorrection(
  roundId: number,
  requestId: number,
  input: ResultInput | null,
  actorId: number,
  now = Date.now(),
  hooks: ApplyHooks = {},
): Promise<{ ok: true } | Refusal> {
  const e = await errorsT();
  const outcome = await tx(async (): Promise<{ ok: true } | Refusal> => {
    // The round lock first: of two approvals only one still finds the request waiting.
    const base = await correctable(roundId, e, true);
    if (!base.ok) return base.refusal;
    const second = await approval(roundId, requestId, input, actorId, now);
    if (!second.ok) return second;
    const { pending, target } = second;
    await run("UPDATE round_results SET status = 'superseded' WHERE round_id = ? AND status = 'confirmed'", roundId);
    await run("UPDATE round_results SET status = 'confirmed', confirmed_by = ?, confirmed_at = ? WHERE id = ?", actorId, now, pending.id);
    if (target === "void") {
      await run("UPDATE rounds SET status = 'cancelled', resulted_at = ?, resulted_by = ?, settled_at = NULL WHERE id = ?", now, actorId, roundId);
    } else {
      await run("UPDATE rounds SET result = ?, resulted_at = ?, resulted_by = ?, settled_at = NULL WHERE id = ?", json.str(target), now, actorId, roundId);
    }
    await run(
      "INSERT INTO settlement_runs (round_id, round_result_id, kind, rewards, created_at) VALUES (?, ?, ?, ?, ?)",
      roundId,
      pending.id,
      target === "void" ? "void" : "correction",
      json.str(base.rewards),
      now,
    );
    await audit(
      actorId,
      "round.correction.confirm",
      `round:${roundId}`,
      { requestedBy: pending.entered_by, reason: pending.reason, result: target === "void" ? null : target },
      now,
    );
    return { ok: true };
  });
  if (!outcome.ok) return outcome;
  invalidateViews(roundId);
  await applyCorrection(roundId, now, hooks);
  return outcome;
}

export async function rejectCorrection(roundId: number, requestId: number, actorId: number, now = Date.now()): Promise<{ ok: true } | Refusal> {
  const e = await errorsT();
  return tx(async (): Promise<{ ok: true } | Refusal> => {
    await roundState(roundId, true);
    const pending = await pendingChange(roundId);
    if (!pending) return refused(e.rounds.noCorrection);
    if (pending.id !== requestId) return refused(e.rounds.correctionChanged);
    await run("UPDATE round_results SET status = 'rejected', confirmed_by = ?, confirmed_at = ? WHERE id = ?", actorId, now, pending.id);
    await audit(actorId, "round.correction.reject", `round:${roundId}`, { requestedBy: pending.entered_by }, now);
    return { ok: true };
  });
}

/** Pay out the differences of a confirmed correction. Safe to call again after a crash. */
export async function applyCorrection(roundId: number, now = Date.now(), hooks: ApplyHooks = {}): Promise<void> {
  const current = await lastRun(roundId);
  if (!current || (current.kind !== "correction" && current.kind !== "void") || current.status !== "running") return;
  const rewards = json.parse<Rewards | null>(current.rewards, null);
  const stored = await q1<{ result: string | null }>("SELECT result FROM round_results WHERE id = ?", current.round_result_id);
  const target = current.kind === "void" ? ("void" as const) : json.parse<RoundResult | null>(stored?.result, null);
  if (!rewards || !target) throw new Error(`correction run ${current.id} of round ${roundId} is incomplete`);

  // Bills keep their old figures until every member is done, so this plan is the same after a restart.
  const plan = await planChange(roundId, target, rewards);
  const ids = [...plan.members.keys()].sort((a, b) => a - b);
  for (const [n, userId] of ids.entries()) {
    hooks.onMember?.(n);
    await tx(() => applyMember(current.id, roundId, userId, plan.members.get(userId)!, now));
  }
  await finishCorrection(roundId, current.id, plan, now);
  invalidateViews(roundId);
}

async function applyMember(runId: number, roundId: number, userId: number, plan: MemberPlan, now: number) {
  const wallets = await walletsOf(userId, true);
  // Under the member's lock: another worker may have done this member already.
  if (await q1("SELECT user_id FROM correction_members WHERE run_id = ? AND user_id = ?", runId, userId)) return;
  await run("INSERT INTO correction_members (run_id, user_id, applied_at) VALUES (?, ?, ?)", runId, userId, now);
  const done = settleLines(wallets, plan.lines);
  await run(
    "UPDATE users SET balance = ?, cashback_balance = ?, affiliate_balance = ?, turnover_required = turnover_required + ? WHERE id = ?",
    done.wallets.balance,
    done.wallets.cashback,
    done.wallets.affiliate,
    plan.turnover,
    userId,
  );
  if (done.ledger.length) {
    await insertMany(
      "transactions",
      ["user_id", "wallet", "type", "amount", "balance_after", "ref", "note", "actor_id", "run_id", "created_at"],
      done.ledger.map((l) => [userId, l.wallet, l.type, l.amount, l.after, l.ref, "แก้ไขผลรางวัล", null, runId, now]),
    );
  }
  if (done.shortfall > 0) {
    await run(
      "INSERT INTO member_debts (user_id, round_id, run_id, amount, outstanding, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      userId,
      roundId,
      runId,
      done.shortfall,
      done.shortfall,
      now,
    );
  }
  // What a wallet gained over the whole correction repays what is owed, this shortfall included. A
  // payment and a take-back that cancel out bring no new money.
  for (const wallet of ["balance", "cashback", "affiliate"] as const) {
    const gained = done.wallets[wallet] - wallets[wallet];
    if (gained > 0) await collectDebt({ q, q1, run }, userId, wallet, gained, now);
  }
}

/**
 * Check every member's money against the change they were due, then rewrite the bills. A difference
 * stops the round for a person to look at.
 */
function finishCorrection(roundId: number, runId: number, plan: Awaited<ReturnType<typeof planChange>>, now: number): Promise<void> {
  return tx(async () => {
    const round = await roundState(roundId, true);
    const current = await lastRun(roundId);
    if (!round || current?.id !== runId || current.status !== "running") return;
    const sums = async (sql: string) => new Map((await q<{ user_id: number; s: number | string }>(sql, runId)).map((r) => [r.user_id, Number(r.s)]));
    const moved = await sums(
      "SELECT user_id, SUM(amount) AS s FROM transactions WHERE run_id = ? AND type IN ('win_correction','cashback_correction','aff_correction','refund') GROUP BY user_id",
    );
    const owed = await sums("SELECT user_id, SUM(amount) AS s FROM member_debts WHERE run_id = ? GROUP BY user_id");
    // Money moved, less what was recorded as owed instead of taken, is the change each member was due.
    const wrong = [...plan.members]
      .map(([userId, p]) => ({ userId, due: total(p.lines), done: (moved.get(userId) ?? 0) - (owed.get(userId) ?? 0) }))
      .filter((m) => m.due !== m.done);
    if (wrong.length) {
      await run("UPDATE settlement_runs SET status = 'mismatch', report = ?, finished_at = ? WHERE id = ?", json.str({ wrong: wrong.slice(0, 50) }), now, runId);
      await audit(null, "settlement.mismatch", `round:${roundId}`, { runId, members: wrong.length }, now);
      console.error(`[correction] round ${roundId} run ${runId} does not reconcile for ${wrong.length} members`);
      return;
    }
    for (const { bill, now: next, items } of plan.after) {
      // settled_at stays: reports restate the day the bill was paid instead of counting it twice.
      await run(
        "UPDATE bills SET status = ?, total_payout = ?, cashback_paid = ?, aff1_paid = ?, aff2_paid = ?, settlement_run_id = ? WHERE id = ?",
        next.status,
        next.payout,
        next.cashback,
        next.aff1,
        next.aff2,
        runId,
        bill.id,
      );
      for (const item of items as ItemRow[]) {
        const status = next.status === "refunded" ? "refunded" : next.winners.has(item) ? "won" : "lost";
        await run("UPDATE bill_items SET status = ?, payout = ? WHERE id = ?", status, status === "won" ? item.potential : 0, item.id);
      }
    }
    await run("UPDATE settlement_runs SET status = 'done', finished_at = ? WHERE id = ?", now, runId);
    if (round.status === "cancelled") {
      await run("DELETE FROM exposures WHERE round_id = ?", roundId);
      await run("DELETE FROM manual_limits WHERE round_id = ?", roundId);
    }
    await run("UPDATE rounds SET settled_at = ? WHERE id = ?", now, roundId);
  });
}

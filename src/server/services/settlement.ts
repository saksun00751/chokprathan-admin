import "server-only";
import { collectDebt } from "chokprathan-core/wallet/debt";
import { maskPhone } from "@/domain/banks";
import { isWinning } from "chokprathan-core/rules/match";
import type { BetTypeCode, RoundResult } from "chokprathan-core/rules/types";
import { invalidate } from "@/server/cache";
import { insertMany, json, q, q1, run, tx, type SqlValue } from "@/server/db";
import type { RewardSettings } from "@/server/catalog";
import { audit } from "./audit";
import { getSettings } from "./settings";
import type { TxType, WalletKind } from "./wallet";

/** Bills settled per transaction. Keeps row locks short while a big draw is being paid. */
const CHUNK = Math.max(1, Number(process.env.SETTLE_CHUNK) || 500);

type BillRow = { id: number; code: string; user_id: number; total_stake: number };
type ItemRow = { id: number; bill_id: number; bet_type: BetTypeCode; number: string; stake: number; discount: number; potential: number };
type Wallets = { balance: number; cashback: number; affiliate: number };

/**
 * Pay (resulted round) or refund (cancelled round) every pending bill, CHUNK bills per
 * transaction, then mark the round settled. Safe to call again after a crash: it only
 * touches bills that are still pending.
 */
export async function settlePending(roundId: number, now = Date.now()): Promise<{ bills: number; items: number }> {
  const round = await q1<{ status: string; result: string | null }>("SELECT status, result FROM rounds WHERE id = ?", roundId);
  if (!round) throw new Error(`round ${roundId} not found`);
  // Anything else (no result yet, or one waiting for a second person) must never be paid or refunded.
  if (round.status !== "resulted" && round.status !== "cancelled") throw new Error(`round ${roundId} has no result`);
  const result = round.status === "resulted" ? json.parse<RoundResult | null>(round.result, null) : null;
  if (round.status === "resulted" && !result) throw new Error(`round ${roundId} has no result`);
  const { rewards: current } = await getSettings();

  let bills = 0;
  let items = 0;
  const opened = await openRun(roundId, round.status === "resulted" ? "result" : "cancel", current, now);
  // A run whose totals did not match waits for a person.
  if (!opened) return { bills, items };
  // A resumed run keeps paying at the rates it started with.
  const { runId, rewards } = opened;
  for (;;) {
    const done = await tx(() => settleChunk(roundId, result, rewards, runId, now));
    if (done.bills === 0) break;
    bills += done.bills;
    items += done.items;
  }
  await finishRun(roundId, runId, now);
  invalidate("lobby", "results", `limits:${roundId}`);
  return { bills, items };
}

/** The run this round is being settled under, starting one if needed. Null after a mismatch. */
function openRun(roundId: number, kind: "result" | "cancel", current: RewardSettings, now: number): Promise<{ runId: number; rewards: RewardSettings } | null> {
  return tx(async () => {
    await q1("SELECT id FROM rounds WHERE id = ? FOR UPDATE", roundId);
    const last = await q1<{ id: number; status: "running" | "done" | "mismatch"; rewards: string | null }>(
      "SELECT id, status, rewards FROM settlement_runs WHERE round_id = ? ORDER BY id DESC LIMIT 1",
      roundId,
    );
    if (last) return last.status === "mismatch" ? null : { runId: last.id, rewards: json.parse<RewardSettings>(last.rewards, current) };
    const confirmed = await q1<{ id: number }>("SELECT id FROM round_results WHERE round_id = ? AND status = 'confirmed' ORDER BY id DESC LIMIT 1", roundId);
    const { lastId } = await run(
      "INSERT INTO settlement_runs (round_id, round_result_id, kind, rewards, created_at) VALUES (?, ?, ?, ?, ?)",
      roundId,
      confirmed?.id ?? null,
      kind,
      json.str(current),
      now,
    );
    return { runId: lastId, rewards: current };
  });
}

/**
 * Close the run once no bill is pending: what the bills say was paid or refunded must equal what the
 * ledger shows. Only then is the round settled.
 */
function finishRun(roundId: number, runId: number, now: number): Promise<void> {
  return tx(async () => {
    const round = await q1<{ status: string }>("SELECT status FROM rounds WHERE id = ? FOR UPDATE", roundId);
    // One statement, so all three figures come from the same moment.
    const sums = (await q1<{ pending: number | string; bills: number | string; ledger: number | string }>(
      `SELECT
         (SELECT COUNT(*) FROM bills WHERE round_id = ? AND status = 'pending') AS pending,
         (SELECT COALESCE(SUM(CASE WHEN status = 'refunded' THEN total_stake ELSE total_payout END), 0) FROM bills WHERE settlement_run_id = ?) AS bills,
         (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE run_id = ? AND type IN ('win', 'refund')) AS ledger`,
      roundId,
      runId,
      runId,
    ))!;
    if (Number(sums.pending) > 0) return;
    const report = { bills: Number(sums.bills), ledger: Number(sums.ledger) };
    if (report.bills !== report.ledger) {
      await run("UPDATE settlement_runs SET status = 'mismatch', report = ?, finished_at = ? WHERE id = ?", json.str(report), now, runId);
      await audit(null, "settlement.mismatch", `round:${roundId}`, { runId, ...report }, now);
      console.error(`[settlement] round ${roundId} run ${runId} does not reconcile: bills ${report.bills}, ledger ${report.ledger}`);
      return;
    }
    await run("UPDATE settlement_runs SET status = 'done', report = ?, finished_at = COALESCE(finished_at, ?) WHERE id = ?", json.str(report), now, runId);
    if (round?.status === "cancelled") {
      await run("DELETE FROM exposures WHERE round_id = ?", roundId);
      await run("DELETE FROM manual_limits WHERE round_id = ?", roundId);
    }
    await run("UPDATE rounds SET settled_at = ? WHERE id = ? AND settled_at IS NULL", now, roundId);
  });
}

/** What a paid bill entitled whom to, kept on the bill so a later correction can pay the difference. */
type Entitlement = { bill: number; cashback: number; aff1User: number | null; aff1: number; aff2User: number | null; aff2: number };

async function recordEntitlements(rows: Entitlement[]) {
  if (rows.length === 0) return;
  const cases = rows.map(() => "WHEN ? THEN ?").join(" ");
  const column = (name: string) => `${name} = CASE id ${cases} END`;
  const values = (pick: (r: Entitlement) => number | null) => rows.flatMap((r) => [r.bill, pick(r)]);
  await run(
    `UPDATE bills SET ${["cashback_paid", "aff1_user", "aff1_paid", "aff2_user", "aff2_paid"].map(column).join(", ")} WHERE id IN (?)`,
    ...values((r) => r.cashback),
    ...values((r) => r.aff1User),
    ...values((r) => r.aff1),
    ...values((r) => r.aff2User),
    ...values((r) => r.aff2),
    rows.map((r) => r.bill),
  );
}

/** One chunk. `result` null means the round was cancelled and every bill is refunded. */
async function settleChunk(roundId: number, result: RoundResult | null, rewards: RewardSettings, runId: number, now: number) {
  const chunk = await q<BillRow>(
    "SELECT id, code, user_id, total_stake FROM bills WHERE round_id = ? AND status = 'pending' ORDER BY id LIMIT ? FOR UPDATE",
    roundId,
    CHUNK,
  );
  if (chunk.length === 0) return { bills: 0, items: 0 };
  const billIds = chunk.map((b) => b.id);
  const itemRows = await q<ItemRow>(
    "SELECT id, bill_id, bet_type, number, stake, discount, potential FROM bill_items WHERE bill_id IN (?) AND status = 'pending'",
    billIds,
  );

  const ownerIds = [...new Set(chunk.map((b) => b.user_id))];
  const owners = new Map(
    (await q<{ id: number; phone: string | null; upline1_id: number | null; upline2_id: number | null }>(
      "SELECT id, phone, upline1_id, upline2_id FROM users WHERE id IN (?)",
      ownerIds,
    )).map((u) => [u.id, u]),
  );
  const involved = new Set(ownerIds);
  if (result) {
    for (const u of owners.values()) {
      if (u.upline1_id && rewards.aff1Bp > 0) involved.add(u.upline1_id);
      if (u.upline2_id && rewards.aff2Bp > 0) involved.add(u.upline2_id);
    }
  }
  // Lock every wallet this chunk touches, in id order (the order every other writer uses too).
  const locked = await q<{ id: number; balance: number; cashback_balance: number; affiliate_balance: number }>(
    "SELECT id, balance, cashback_balance, affiliate_balance FROM users WHERE id IN (?) ORDER BY id FOR UPDATE",
    [...involved].sort((a, b) => a - b),
  );
  const wallets = new Map<number, Wallets>(locked.map((u) => [u.id, { balance: u.balance, cashback: u.cashback_balance, affiliate: u.affiliate_balance }]));
  const deltas = new Map<number, Wallets & { turnover: number }>();
  const ledger: SqlValue[][] = [];
  const credit = (userId: number, wallet: WalletKind, amount: number, type: TxType, ref: string, note: string) => {
    const w = wallets.get(userId);
    if (!w || amount <= 0) return;
    w[wallet] += amount;
    const d = deltas.get(userId) ?? { balance: 0, cashback: 0, affiliate: 0, turnover: 0 };
    d[wallet] += amount;
    deltas.set(userId, d);
    ledger.push([userId, wallet, type, amount, w[wallet], ref, note.slice(0, 255), null, runId, now]);
  };

  const entitled: Entitlement[] = [];
  const itemsByBill = new Map<number, ItemRow[]>();
  for (const it of itemRows) itemsByBill.set(it.bill_id, [...(itemsByBill.get(it.bill_id) ?? []), it]);

  if (!result) {
    for (const b of chunk) credit(b.user_id, "balance", b.total_stake, "refund", b.code, "คืนเงิน งวดถูกยกเลิก");
    await run("UPDATE bill_items SET status = 'refunded' WHERE bill_id IN (?) AND status = 'pending'", billIds);
    await run("UPDATE bills SET status = 'refunded', settled_at = ?, settlement_run_id = ? WHERE id IN (?)", now, runId, billIds);
  } else {
    const wonItems: number[] = [];
    const wonBills: [number, number][] = [];
    const lostBills: number[] = [];
    for (const b of chunk) {
      let payout = 0;
      // satang actually paid for the lines that lost
      let lostPaid = 0;
      let won = false;
      for (const it of itemsByBill.get(b.id) ?? []) {
        if (isWinning(it.bet_type, it.number, result)) {
          won = true;
          payout += it.potential;
          wonItems.push(it.id);
        } else {
          lostPaid += it.stake * 100 - it.discount;
        }
      }
      if (won) wonBills.push([b.id, payout]);
      else lostBills.push(b.id);

      credit(b.user_id, "balance", payout, "win", b.code, "ถูกรางวัล");
      const cashback = Math.floor((lostPaid * rewards.cashbackBp) / 10_000);
      credit(b.user_id, "cashback", cashback, "cashback_earn", b.code, "คืนยอดเสีย");
      const owner = owners.get(b.user_id);
      const tiers: [number | null | undefined, number][] = [
        [owner?.upline1_id, rewards.aff1Bp],
        [owner?.upline2_id, rewards.aff2Bp],
      ];
      const [aff1, aff2] = tiers.map(([uplineId, bp]) => {
        const amount = uplineId && wallets.has(uplineId) ? Math.floor((b.total_stake * bp) / 10_000) : 0;
        if (uplineId) credit(uplineId, "affiliate", amount, "aff_earn", b.code, `ค่าแนะนำจาก ${maskPhone(owner?.phone)}`);
        return amount;
      });
      entitled.push({ bill: b.id, cashback, aff1User: owner?.upline1_id ?? null, aff1, aff2User: owner?.upline2_id ?? null, aff2 });
      const d = deltas.get(b.user_id) ?? { balance: 0, cashback: 0, affiliate: 0, turnover: 0 };
      d.turnover += b.total_stake;
      deltas.set(b.user_id, d);
    }
    if (wonItems.length) await run("UPDATE bill_items SET status = 'won', payout = potential WHERE id IN (?)", wonItems);
    await run("UPDATE bill_items SET status = 'lost', payout = 0 WHERE bill_id IN (?) AND status = 'pending'", billIds);
    if (lostBills.length) await run("UPDATE bills SET status = 'lost', total_payout = 0, settled_at = ?, settlement_run_id = ? WHERE id IN (?)", now, runId, lostBills);
    if (wonBills.length) {
      await run(
        `UPDATE bills SET status = 'won', settled_at = ?, settlement_run_id = ?, total_payout = CASE id ${wonBills.map(() => "WHEN ? THEN ?").join(" ")} END WHERE id IN (?)`,
        now,
        runId,
        ...wonBills.flat(),
        wonBills.map(([id]) => id),
      );
    }
  }

  // A cancelled round entitles nobody to anything beyond the refund.
  if (!result) entitled.push(...chunk.map((b) => ({ bill: b.id, cashback: 0, aff1User: null, aff1: 0, aff2User: null, aff2: 0 })));
  await recordEntitlements(entitled);
  await insertMany("transactions", ["user_id", "wallet", "type", "amount", "balance_after", "ref", "note", "actor_id", "run_id", "created_at"], ledger);
  await applyDeltas(deltas);
  await collectFromCredits(deltas, now);
  return { bills: chunk.length, items: itemRows.length };
}

/** Winnings and rewards just paid repay what their receivers owe, before this transaction ends. */
async function collectFromCredits(deltas: Map<number, Wallets & { turnover: number }>, now: number) {
  if (deltas.size === 0) return;
  const owing = await q<{ user_id: number }>("SELECT DISTINCT user_id FROM member_debts WHERE user_id IN (?) AND outstanding > 0 ORDER BY user_id", [...deltas.keys()]);
  for (const { user_id } of owing) {
    for (const wallet of ["balance", "cashback", "affiliate"] as const) {
      const paid = deltas.get(user_id)![wallet];
      if (paid > 0) await collectDebt({ q, q1, run }, user_id, wallet, paid, now);
    }
  }
}

/** One UPDATE for every wallet change in the chunk. The rows are already locked by this transaction. */
async function applyDeltas(deltas: Map<number, Wallets & { turnover: number }>) {
  const entries = [...deltas.entries()];
  for (let i = 0; i < entries.length; i += 400) {
    const part = entries.slice(i, i + 400);
    const sets: string[] = [];
    const params: SqlValue[] = [];
    const column = (col: string, pick: (d: Wallets & { turnover: number }) => number, wrap?: (expr: string) => string) => {
      const hits = part.filter(([, d]) => pick(d) !== 0);
      if (hits.length === 0) return;
      const expr = `CASE id ${hits.map(() => "WHEN ? THEN ?").join(" ")} ELSE 0 END`;
      sets.push(wrap ? `${col} = ${wrap(expr)}` : `${col} = ${col} + ${expr}`);
      for (const [id, d] of hits) params.push(id, pick(d));
    };
    column("balance", (d) => d.balance);
    column("cashback_balance", (d) => d.cashback);
    column("affiliate_balance", (d) => d.affiliate);
    column("turnover_required", (d) => d.turnover, (expr) => `GREATEST(0, turnover_required - ${expr})`);
    if (sets.length === 0) continue;
    await run(`UPDATE users SET ${sets.join(", ")} WHERE id IN (?)`, ...params, part.map(([id]) => id));
  }
}

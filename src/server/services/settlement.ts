import "server-only";
import { maskPhone } from "@/domain/banks";
import { isWinning } from "@/domain/match";
import type { BetTypeCode, RoundResult } from "@/domain/types";
import { invalidate } from "@/server/cache";
import { insertMany, json, q, q1, run, tx, type SqlValue } from "@/server/db";
import type { RewardSettings } from "@/server/catalog";
import { getSettings } from "./settings";
import type { TxType, WalletKind } from "./wallet";

/** Bills settled per transaction. Keeps row locks short while a big draw is being paid. */
const CHUNK = Math.max(1, Number(process.env.SETTLE_CHUNK) || 500);

type BillRow = { id: number; code: string; user_id: number; total_stake: number };
type ItemRow = { id: number; bill_id: number; bet_type: BetTypeCode; number: string; stake: number; potential: number };
type Wallets = { balance: number; cashback: number; affiliate: number };

/**
 * Pay (resulted round) or refund (cancelled round) every pending bill, CHUNK bills per
 * transaction, then mark the round settled. Safe to call again after a crash: it only
 * touches bills that are still pending.
 */
export async function settlePending(roundId: number, now = Date.now()): Promise<{ bills: number; items: number }> {
  const round = await q1<{ status: string; result: string | null }>("SELECT status, result FROM rounds WHERE id = ?", roundId);
  if (!round) throw new Error(`round ${roundId} not found`);
  if (round.status === "scheduled") throw new Error(`round ${roundId} has no result`);
  const result = round.status === "resulted" ? json.parse<RoundResult | null>(round.result, null) : null;
  if (round.status === "resulted" && !result) throw new Error(`round ${roundId} has no result`);
  const { rewards } = await getSettings();

  let bills = 0;
  let items = 0;
  for (;;) {
    const done = await tx(() => settleChunk(roundId, result, rewards, now));
    if (done.bills === 0) break;
    bills += done.bills;
    items += done.items;
  }
  await tx(async () => {
    if (round.status === "cancelled") {
      await run("DELETE FROM exposures WHERE round_id = ?", roundId);
      await run("DELETE FROM manual_limits WHERE round_id = ?", roundId);
    }
    await run("UPDATE rounds SET settled_at = ? WHERE id = ? AND settled_at IS NULL", now, roundId);
  });
  invalidate("lobby", "results", `limits:${roundId}`);
  return { bills, items };
}

/** One chunk. `result` null means the round was cancelled and every bill is refunded. */
async function settleChunk(roundId: number, result: RoundResult | null, rewards: RewardSettings, now: number) {
  const chunk = await q<BillRow>(
    "SELECT id, code, user_id, total_stake FROM bills WHERE round_id = ? AND status = 'pending' ORDER BY id LIMIT ? FOR UPDATE",
    roundId,
    CHUNK,
  );
  if (chunk.length === 0) return { bills: 0, items: 0 };
  const billIds = chunk.map((b) => b.id);
  const itemRows = await q<ItemRow>(
    "SELECT id, bill_id, bet_type, number, stake, potential FROM bill_items WHERE bill_id IN (?) AND status = 'pending'",
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
    ledger.push([userId, wallet, type, amount, w[wallet], ref, note.slice(0, 255), null, now]);
  };

  const itemsByBill = new Map<number, ItemRow[]>();
  for (const it of itemRows) itemsByBill.set(it.bill_id, [...(itemsByBill.get(it.bill_id) ?? []), it]);

  if (!result) {
    for (const b of chunk) credit(b.user_id, "balance", b.total_stake, "refund", b.code, "คืนเงิน งวดถูกยกเลิก");
    await run("UPDATE bill_items SET status = 'refunded' WHERE bill_id IN (?) AND status = 'pending'", billIds);
    await run("UPDATE bills SET status = 'refunded', settled_at = ? WHERE id IN (?)", now, billIds);
  } else {
    const wonItems: number[] = [];
    const wonBills: [number, number][] = [];
    const lostBills: number[] = [];
    for (const b of chunk) {
      let payout = 0;
      let lostStake = 0;
      let won = false;
      for (const it of itemsByBill.get(b.id) ?? []) {
        if (isWinning(it.bet_type, it.number, result)) {
          won = true;
          payout += it.potential;
          wonItems.push(it.id);
        } else {
          lostStake += it.stake;
        }
      }
      if (won) wonBills.push([b.id, payout]);
      else lostBills.push(b.id);

      credit(b.user_id, "balance", payout, "win", b.code, "ถูกรางวัล");
      credit(b.user_id, "cashback", Math.floor((lostStake * 100 * rewards.cashbackBp) / 10_000), "cashback_earn", b.code, "คืนยอดเสีย");
      const owner = owners.get(b.user_id);
      const tiers: [number | null | undefined, number][] = [
        [owner?.upline1_id, rewards.aff1Bp],
        [owner?.upline2_id, rewards.aff2Bp],
      ];
      for (const [uplineId, bp] of tiers) {
        if (uplineId) credit(uplineId, "affiliate", Math.floor((b.total_stake * bp) / 10_000), "aff_earn", b.code, `ค่าแนะนำจาก ${maskPhone(owner?.phone)}`);
      }
      const d = deltas.get(b.user_id) ?? { balance: 0, cashback: 0, affiliate: 0, turnover: 0 };
      d.turnover += b.total_stake;
      deltas.set(b.user_id, d);
    }
    if (wonItems.length) await run("UPDATE bill_items SET status = 'won', payout = potential WHERE id IN (?)", wonItems);
    await run("UPDATE bill_items SET status = 'lost', payout = 0 WHERE bill_id IN (?) AND status = 'pending'", billIds);
    if (lostBills.length) await run("UPDATE bills SET status = 'lost', total_payout = 0, settled_at = ? WHERE id IN (?)", now, lostBills);
    if (wonBills.length) {
      await run(
        `UPDATE bills SET status = 'won', settled_at = ?, total_payout = CASE id ${wonBills.map(() => "WHEN ? THEN ?").join(" ")} END WHERE id IN (?)`,
        now,
        ...wonBills.flat(),
        wonBills.map(([id]) => id),
      );
    }
  }

  await insertMany("transactions", ["user_id", "wallet", "type", "amount", "balance_after", "ref", "note", "actor_id", "created_at"], ledger);
  await applyDeltas(deltas);
  return { bills: chunk.length, items: itemRows.length };
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

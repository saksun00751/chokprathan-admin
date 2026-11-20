import { createHash } from "node:crypto";

/**
 * Tamper evidence for the audit log. Every sealed row carries the hash of the row before it, so
 * editing, deleting, or re-ordering a sealed row breaks the chain from that point on. Pure
 * functions; the sealing job lives in services/audit.
 */
export const GENESIS = "0".repeat(64);

export interface ChainRow {
  seq: number;
  id: number;
  actor_id: number | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  ua: string | null;
  created_at: number;
}

export interface SealedRow extends ChainRow {
  prev_hash: string;
  hash: string;
}

export function chainHash(prev: string, row: ChainRow): string {
  const fields = [row.seq, row.id, row.actor_id, row.action, row.target, row.detail, row.ip, row.ua, row.created_at];
  return createHash("sha256").update(prev).update("\n").update(JSON.stringify(fields)).digest("hex");
}

export type ChainCheck = { ok: true; last: { seq: number; hash: string } | null } | { ok: false; seq: number; reason: "gap" | "link" | "hash" };

/** Check rows sorted by seq, starting at `startSeq` whose predecessor hash is `startPrev`. */
export function verifyChain(rows: SealedRow[], startPrev: string, startSeq: number): ChainCheck {
  let prev = startPrev;
  let expected = startSeq;
  for (const row of rows) {
    if (Number(row.seq) !== expected) return { ok: false, seq: expected, reason: "gap" };
    if (row.prev_hash !== prev) return { ok: false, seq: expected, reason: "link" };
    if (chainHash(prev, { ...row, seq: Number(row.seq) }) !== row.hash) return { ok: false, seq: expected, reason: "hash" };
    prev = row.hash;
    expected++;
  }
  return { ok: true, last: rows.length ? { seq: expected - 1, hash: prev } : null };
}

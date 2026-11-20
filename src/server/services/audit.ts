import "server-only";
import { json, q, q1, run } from "@/server/db";
import { COLL, mongoDb } from "@/server/mongo";
import { clientInfo } from "@/server/request";
import { chainHash, GENESIS, verifyChain, type ChainCheck, type SealedRow } from "./audit-chain";

/**
 * Staff audit trail. Each row records who, what, the target, the detail (edits store
 * `{ before, after }`), the IP address and the browser. The scheduler later seals rows into a hash
 * chain and copies them to MongoDB, so a row edited or deleted afterwards is detected.
 */
export async function audit(actorId: number | null, action: string, target: string | null, detail?: unknown, now = Date.now(), ip: string | null = null) {
  // Outside a request (scheduler, scripts) there are no headers: record what is known.
  const client = await clientInfo().catch(() => null);
  await run(
    "INSERT INTO audit_log (actor_id, action, target, detail, ip, ua, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    actorId,
    action.slice(0, 40),
    target?.slice(0, 60) ?? null,
    detail === undefined ? null : json.str(detail),
    ip ?? client?.ip ?? null,
    client?.userAgent?.slice(0, 255) ?? null,
    now,
  );
}

/** Only the fields that changed, as `{ before, after }`, for edit logs. */
export function changes<T extends Record<string, unknown>>(before: T, after: Partial<T>): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}

/* ---------- sealing and verification (scheduler) ---------- */

/** Rows younger than this are left for the next run, so slow transactions commit first. */
const SEAL_DELAY = 60_000;
const BATCH = 500;
const COLUMNS = "id, actor_id, action, target, detail, ip, ua, created_at";

export async function sealAudit(now = Date.now()): Promise<number> {
  const head = await q1<{ seq: number; hash: string }>("SELECT seq, hash FROM audit_log WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1");
  let seq = Number(head?.seq ?? 0);
  let prev = head?.hash ?? GENESIS;
  const rows = await q<Omit<SealedRow, "seq" | "prev_hash" | "hash">>(
    `SELECT ${COLUMNS} FROM audit_log WHERE seq IS NULL AND created_at < ? ORDER BY id LIMIT ?`,
    now - SEAL_DELAY,
    BATCH,
  );
  const sealed: SealedRow[] = [];
  for (const r of rows) {
    const row = { ...r, id: Number(r.id), created_at: Number(r.created_at), seq: seq + 1 };
    const hash = chainHash(prev, row);
    const changed = (await run("UPDATE audit_log SET seq = ?, prev_hash = ?, hash = ? WHERE id = ? AND seq IS NULL", row.seq, prev, hash, row.id)).changes;
    if (!changed) break;
    sealed.push({ ...row, prev_hash: prev, hash });
    seq = row.seq;
    prev = hash;
  }
  if (sealed.length) await mirror(sealed);
  return sealed.length;
}

type AuditDoc = Omit<SealedRow, "id"> & { _id: number };

/** The MongoDB copy is what still shows the original after someone rewrites MariaDB. */
async function mirror(rows: SealedRow[]) {
  const db = await mongoDb();
  if (!db) return;
  try {
    await db
      .collection<AuditDoc>(COLL.auditLog)
      .bulkWrite(rows.map(({ id, ...r }) => ({ replaceOne: { filter: { _id: id }, replacement: r, upsert: true } })), { ordered: false });
  } catch (error) {
    console.error("[audit] MongoDB copy failed:", error instanceof Error ? error.message : error);
  }
}

export type AuditIntegrity = { at: number; checked: number; unsealed: number } & (
  | { ok: true }
  | { ok: false; seq: number; reason: "gap" | "link" | "hash" | "copy" | "missing" }
);

/** Walk the whole chain, compare it with the MongoDB copy, and store the result. */
export async function verifyAudit(now = Date.now()): Promise<AuditIntegrity> {
  const db = await mongoDb();
  const copies = db?.collection<AuditDoc>(COLL.auditLog);
  let prev = GENESIS;
  let next = 1;
  let checked = 0;
  let problem: { seq: number; reason: "gap" | "link" | "hash" | "copy" | "missing" } | null = null;
  for (;;) {
    const rows = await q<SealedRow>(`SELECT seq, prev_hash, hash, ${COLUMNS} FROM audit_log WHERE seq >= ? ORDER BY seq LIMIT 2000`, next);
    if (rows.length === 0) break;
    const check: ChainCheck = verifyChain(rows.map((r) => ({ ...r, id: Number(r.id), seq: Number(r.seq), created_at: Number(r.created_at) })), prev, next);
    if (!check.ok) {
      problem = { seq: check.seq, reason: check.reason };
      break;
    }
    if (copies) {
      try {
        const kept = new Map((await copies.find({ seq: { $gte: next, $lte: check.last!.seq } }, { projection: { seq: 1, hash: 1 } }).toArray()).map((d) => [d.seq, d.hash]));
        const differs = rows.find((r) => kept.has(Number(r.seq)) && kept.get(Number(r.seq)) !== r.hash);
        if (differs) {
          problem = { seq: Number(differs.seq), reason: "copy" };
          break;
        }
      } catch {
        // MongoDB unavailable: the chain check above still stands
      }
    }
    checked += rows.length;
    prev = check.last!.hash;
    next = check.last!.seq + 1;
  }
  if (!problem && copies) {
    // Sealed rows deleted from the end of MariaDB still exist in the copy.
    const copyHead = await copies.find({}, { projection: { seq: 1 } }).sort({ seq: -1 }).limit(1).next().catch(() => null);
    if (copyHead && copyHead.seq >= next) problem = { seq: next, reason: "missing" };
  }
  const unsealed = Number((await q1<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE seq IS NULL"))?.n ?? 0);
  const result: AuditIntegrity = problem ? { at: now, checked, unsealed, ok: false, ...problem } : { at: now, checked, unsealed, ok: true };
  await run(
    "INSERT INTO system_status (name, `value`, updated_at) VALUES ('audit_chain', ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = VALUES(updated_at)",
    JSON.stringify(result),
    now,
  );
  return result;
}

export async function auditIntegrity(): Promise<AuditIntegrity | null> {
  const row = await q1<{ value: string }>("SELECT `value` FROM system_status WHERE name = 'audit_chain'");
  return row ? json.parse<AuditIntegrity | null>(row.value, null) : null;
}

import "server-only";
import type { DateRange } from "@/domain/periods";
import { q, run } from "@/server/db";
import { COLL, mongoDb } from "@/server/mongo";

/**
 * Sign-in history and referral-link clicks: written to MongoDB, or to the MariaDB tables
 * `auth_log` / `ref_clicks` when MongoDB is unavailable. Readers merge both, so rows from before
 * the switch and fallback rows stay visible.
 */

const MEMBER_PHONE = /^0\d{9}$/;

/** Staff sign in with a username; a 10-digit phone number is a member. */
export const isStaffIdentifier = (identifier: string | null) => identifier !== null && !MEMBER_PHONE.test(identifier);

/** The newest `limit` rows of two lists that are each sorted newest first. */
export function mergeNewest<T extends { created_at: number }>(a: T[], b: T[], limit: number): T[] {
  return [...a, ...b].sort((x, y) => y.created_at - x.created_at).slice(0, limit);
}

export type SignInCount = { user_id: number; event: string; n: number; last: number };

export function mergeCounts(a: SignInCount[], b: SignInCount[]): SignInCount[] {
  const out = new Map<string, SignInCount>();
  for (const row of [...a, ...b]) {
    const key = `${row.user_id}:${row.event}`;
    const seen = out.get(key);
    out.set(key, seen ? { ...seen, n: seen.n + row.n, last: Math.max(seen.last, row.last) } : { ...row });
  }
  return [...out.values()];
}

/* ---------- sign-ins ---------- */

export interface AuthLogEntry {
  userId: number | null;
  identifier: string | null;
  event: string;
  ip: string | null;
  userAgent: string | null;
  at: number;
}

type AuthDoc = AuthLogEntry & { atDate: Date };

export async function writeAuthLog(e: AuthLogEntry): Promise<void> {
  const identifier = e.identifier?.slice(0, 100) ?? null;
  const userAgent = e.userAgent?.slice(0, 255) ?? null;
  const db = await mongoDb();
  if (db) {
    try {
      await db.collection<AuthDoc>(COLL.authLog).insertOne({ ...e, identifier, userAgent, atDate: new Date(e.at) });
      return;
    } catch {
      // fall through to MariaDB
    }
  }
  await run(
    "INSERT INTO auth_log (user_id, identifier, event, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    e.userId,
    identifier,
    e.event,
    e.ip,
    userAgent,
    e.at,
  );
}

export interface SignInRow {
  id: string;
  user_id: number | null;
  identifier: string | null;
  event: string;
  ip: string | null;
  user_agent: string | null;
  created_at: number;
  name: string | null;
}

/** Latest staff sign-ins, plus failed attempts with a username that matches no one. */
export async function recentStaffSignIns(staff: { id: number; name: string }[], limit: number): Promise<SignInRow[]> {
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const fromMaria = q<Omit<SignInRow, "id"> & { id: number }>(
    `SELECT a.*, u.name FROM auth_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE u.role = 'staff' OR (a.user_id IS NULL AND a.identifier NOT REGEXP '^0[0-9]{9}$')
     ORDER BY a.created_at DESC LIMIT ?`,
    limit,
  ).then((rows) => rows.map((r): SignInRow => ({ ...r, id: `s${r.id}` })));
  const fromMongo = (async (): Promise<SignInRow[]> => {
    const db = await mongoDb();
    if (!db) return [];
    try {
      const docs = await db
        .collection<AuthDoc>(COLL.authLog)
        .find({ $or: [{ userId: { $in: [...names.keys()] } }, { userId: null, identifier: { $type: "string", $not: MEMBER_PHONE } }] })
        .sort({ at: -1 })
        .limit(limit)
        .toArray();
      return docs.map((d) => ({
        id: `m${d._id.toHexString()}`,
        user_id: d.userId,
        identifier: d.identifier,
        event: d.event,
        ip: d.ip,
        user_agent: d.userAgent,
        created_at: d.at,
        name: d.userId === null ? null : (names.get(d.userId) ?? null),
      }));
    } catch {
      return [];
    }
  })();
  const [maria, mongo] = await Promise.all([fromMaria, fromMongo]);
  return mergeNewest(mongo, maria, limit);
}

/** Sign-in events per staff member in the range. */
export async function staffSignInCounts(staffIds: number[], r: DateRange): Promise<SignInCount[]> {
  if (staffIds.length === 0) return [];
  const fromMaria = q<SignInCount>(
    `SELECT user_id, event, COUNT(*) AS n, MAX(created_at) AS last FROM auth_log
     WHERE user_id IN (?) AND created_at >= ? AND created_at < ? GROUP BY user_id, event`,
    staffIds,
    r.startMs,
    r.endMs,
  );
  const fromMongo = (async (): Promise<SignInCount[]> => {
    const db = await mongoDb();
    if (!db) return [];
    try {
      const rows = await db
        .collection<AuthDoc>(COLL.authLog)
        .aggregate<{ _id: { u: number; e: string }; n: number; last: number }>([
          { $match: { userId: { $in: staffIds }, at: { $gte: r.startMs, $lt: r.endMs } } },
          { $group: { _id: { u: "$userId", e: "$event" }, n: { $sum: 1 }, last: { $max: "$at" } } },
        ])
        .toArray();
      return rows.map((x) => ({ user_id: x._id.u, event: x._id.e, n: x.n, last: x.last }));
    } catch {
      return [];
    }
  })();
  const [maria, mongo] = await Promise.all([fromMaria, fromMongo]);
  return mergeCounts(mongo, maria.map((x) => ({ ...x, n: Number(x.n), last: Number(x.last) })));
}

/* ---------- referral-link clicks ---------- */

type ClickDoc = { userId: number; at: number };

export async function writeRefClick(userId: number, at: number): Promise<void> {
  const db = await mongoDb();
  if (db) {
    try {
      await db.collection<ClickDoc>(COLL.refClicks).insertOne({ userId, at });
      return;
    } catch {
      // fall through to MariaDB
    }
  }
  await run("INSERT INTO ref_clicks (user_id, at) VALUES (?, ?)", userId, at);
}

export async function refClickCount(userId: number): Promise<number> {
  const [maria, mongo] = await Promise.all([
    q<{ n: number }>("SELECT COUNT(*) AS n FROM ref_clicks WHERE user_id = ?", userId).then((r) => Number(r[0]?.n ?? 0)),
    (async () => {
      const db = await mongoDb();
      if (!db) return 0;
      try {
        return await db.collection<ClickDoc>(COLL.refClicks).countDocuments({ userId });
      } catch {
        return 0;
      }
    })(),
  ]);
  return maria + mongo;
}

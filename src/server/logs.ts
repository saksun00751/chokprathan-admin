import "server-only";
import type { DateRange } from "@/domain/periods";
import { q } from "@/server/db";

/**
 * Employee sign-in history, read from the admin-owned `employee_auth_log` (written by employee-auth).
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

/** Latest employee sign-ins, plus failed attempts with a username that matches no one. */
export async function recentStaffSignIns(staff: { id: number; name: string }[], limit: number): Promise<SignInRow[]> {
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const rows = await q<Omit<SignInRow, "id" | "name"> & { id: number }>(
    `SELECT id, employee_id AS user_id, identifier, event, ip, user_agent, created_at
     FROM employee_auth_log ORDER BY created_at DESC LIMIT ?`,
    limit,
  );
  return rows.map((r): SignInRow => ({ ...r, id: `s${r.id}`, name: r.user_id === null ? null : (names.get(r.user_id) ?? null) }));
}

/** Sign-in events per employee in the range. */
export async function staffSignInCounts(staffIds: number[], r: DateRange): Promise<SignInCount[]> {
  if (staffIds.length === 0) return [];
  const rows = await q<SignInCount>(
    `SELECT employee_id AS user_id, event, COUNT(*) AS n, MAX(created_at) AS last FROM employee_auth_log
     WHERE employee_id IN (?) AND created_at >= ? AND created_at < ? GROUP BY employee_id, event`,
    staffIds,
    r.startMs,
    r.endMs,
  );
  return rows.map((x) => ({ ...x, n: Number(x.n), last: Number(x.last) }));
}

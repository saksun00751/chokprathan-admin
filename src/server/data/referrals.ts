import "server-only";
// Authorization lives here, next to the data, like the other admin readers.
import { io } from "next/cache";
import { LIST_PAGE, parseReferralFilter } from "@/domain/list-filters";
import { q, q1 } from "@/server/db";
import { AFFILIATE_TYPES } from "@/server/stats/derive";
import { requireEmployee } from "@/server/session";
import { contactView } from "./admin";

interface Referrer {
  id: number;
  name: string;
  phone: string | null;
  ref_code: string;
  affiliate_balance: number;
  direct: number;
  indirect: number;
  earned: number;
}

/** Commission earned counts every wallet: a correction can take claimed money back from the main one. */
const REFERRER = `SELECT u.id, u.name, u.phone, u.ref_code, u.affiliate_balance,
  (SELECT COUNT(*) FROM users d WHERE d.upline1_id = u.id AND d.is_simulated = 0) AS direct,
  (SELECT COUNT(*) FROM users d WHERE d.upline2_id = u.id AND d.is_simulated = 0) AS indirect,
  (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t WHERE t.user_id = u.id AND t.type IN (?)) AS earned
  FROM users u`;

/** Members who have referred someone, the highest earners first. */
export async function getReferrers(params: Record<string, string | string[] | undefined>) {
  const viewer = await requireEmployee("members.view");
  await io();
  const filter = parseReferralFilter(params);
  const like = `%${filter.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await q<Referrer>(
    `${REFERRER} WHERE u.role = 'member' AND u.is_simulated = 0
       AND EXISTS (SELECT 1 FROM users d WHERE d.upline1_id = u.id AND d.is_simulated = 0)
       ${filter.search ? "AND (u.phone LIKE ? OR u.name LIKE ? OR u.ref_code = ?)" : ""}
     ORDER BY earned DESC, direct DESC, u.id LIMIT ? OFFSET ?`,
    [...AFFILIATE_TYPES],
    ...(filter.search ? [like, like, filter.search.toUpperCase()] : []),
    LIST_PAGE + 1,
    (filter.page - 1) * LIST_PAGE,
  );
  const view = contactView(viewer);
  return { filter, older: rows.length > LIST_PAGE, rows: rows.slice(0, LIST_PAGE).map((r) => ({ ...r, phone: view.phone(r.phone) })) };
}

export const DOWNLINE_MAX = 500;

/** One referrer with the members under them, or null. */
export async function getReferrer(userId: number) {
  const viewer = await requireEmployee("members.view");
  await io();
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const referrer = await q1<Referrer>(`${REFERRER} WHERE u.id = ? AND u.role = 'member'`, [...AFFILIATE_TYPES], userId);
  if (!referrer) return null;
  const downline = await q<{ id: number; name: string; phone: string | null; created_at: number; level: number; stake: number | null }>(
    `SELECT d.id, d.name, d.phone, d.created_at, IF(d.upline1_id = ?, 1, 2) AS level,
            (SELECT SUM(b.total_stake) FROM bills b WHERE b.user_id = d.id AND b.status IN ('pending','won','lost')) AS stake
     FROM users d WHERE (d.upline1_id = ? OR d.upline2_id = ?) AND d.is_simulated = 0
     ORDER BY level, d.created_at DESC LIMIT ?`,
    userId,
    userId,
    userId,
    DOWNLINE_MAX,
  );
  const view = contactView(viewer);
  return {
    referrer: { ...referrer, phone: view.phone(referrer.phone) },
    downline: downline.map((d) => ({ ...d, phone: view.phone(d.phone) })),
  };
}

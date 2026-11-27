import "server-only";
// Authorization lives here, next to the data, like the other admin readers.
import { io } from "next/cache";
import { dayKey } from "@/core/rules/time";
import { LIST_PAGE, ledgerWhere, parseLedgerFilter, type LedgerFilter } from "@/domain/list-filters";
import { q } from "@/server/db";
import { can } from "@/server/services/employee-auth";
import { requireEmployee } from "@/server/session";
import { contactView } from "./admin";

/** One page of every member's money movements, newest first. */
export async function getLedger(params: Record<string, string | string[] | undefined>) {
  const viewer = await requireEmployee("finance.view");
  await io();
  const filter = parseLedgerFilter(params, dayKey(Date.now()));
  const where = ledgerWhere(filter);
  const rows = await q<{
    id: number;
    user_id: number;
    wallet: Exclude<LedgerFilter["wallet"], "">;
    type: Exclude<LedgerFilter["type"], "">;
    amount: number;
    balance_after: number;
    ref: string | null;
    note: string | null;
    created_at: number;
    name: string;
    phone: string | null;
    staff: string | null;
  }>(
    `SELECT t.id, t.user_id, t.wallet, t.type, t.amount, t.balance_after, t.ref, t.note, t.created_at, u.name, u.phone, s.name AS staff
     FROM transactions t JOIN users u ON u.id = t.user_id LEFT JOIN employees s ON s.id = t.actor_id
     WHERE ${where.sql} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
    ...where.params,
    // One more than a page, to know whether an older page exists.
    LIST_PAGE + 1,
    (filter.page - 1) * LIST_PAGE,
  );
  const view = contactView(viewer);
  return {
    filter,
    older: rows.length > LIST_PAGE,
    /** Links to member and bill pages are only for staff who may open them. */
    members: can(viewer, "members.view"),
    rows: rows.slice(0, LIST_PAGE).map((r) => ({ ...r, phone: view.phone(r.phone) })),
  };
}

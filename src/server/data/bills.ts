import "server-only";
// Authorization lives here, next to the data, like the other admin readers.
import { io } from "next/cache";
import { BILLS_PER_PAGE, billWhere, type BillFilter } from "@/domain/bill-filter";
import type { BillStatus } from "@/domain/labels";
import type { BetTypeCode, Segment } from "@/core/rules/types";
import { lottoShort, roundName } from "@/i18n/labels";
import { getI18n } from "@/i18n/rsc";
import { json, q, q1 } from "@/server/db";
import { listLottos } from "@/server/services/lottos";
import { requireEmployee } from "@/server/session";
import { contactView } from "./admin";

interface BillRow {
  id: number;
  code: string;
  status: BillStatus;
  total_stake: number;
  total_payout: number;
  created_at: number;
  user_id: number;
  name: string;
  phone: string | null;
  lotto_id: number;
  round_id: number;
  round_no: number | null;
  closes_at: number;
  planned_close: number | null;
}

const BILLS = `FROM bills b JOIN rounds r ON r.id = b.round_id JOIN users u ON u.id = b.user_id`;
const COLUMNS = `b.id, b.code, b.status, b.total_stake, b.total_payout, b.created_at, b.user_id, u.name, u.phone,
       r.lotto_id, b.round_id, r.round_no, r.closes_at, r.planned_close`;

/** One page of members' bills, newest first. */
export async function getBills(filter: BillFilter) {
  const { lang, t } = await getI18n();
  const viewer = await requireEmployee("members.view");
  await io();
  const where = billWhere(filter);
  const [rows, lottos] = await Promise.all([
    // One more than a page, to know whether an older page exists.
    q<BillRow>(
      `SELECT ${COLUMNS} ${BILLS} WHERE ${where.sql} ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?`,
      ...where.params,
      BILLS_PER_PAGE + 1,
      (filter.page - 1) * BILLS_PER_PAGE,
    ),
    listLottos({ includeDisabled: true }),
  ]);
  const view = contactView(viewer);
  const byId = new Map(lottos.map((l) => [l.id, l]));
  return {
    older: rows.length > BILLS_PER_PAGE,
    lottos: lottos.map((l) => ({ id: l.id, name: lottoShort(l, lang, t) })),
    bills: rows.slice(0, BILLS_PER_PAGE).map((b) => {
      const lotto = byId.get(b.lotto_id);
      return {
        id: b.id,
        code: b.code,
        status: b.status,
        stake: b.total_stake,
        payout: b.total_payout,
        createdAt: b.created_at,
        member: { id: b.user_id, name: b.name, phone: view.phone(b.phone) },
        lotto: lotto ? lottoShort(lotto, lang, t) : "-",
        flag: lotto?.flag ?? null,
        round: roundName({ roundNo: b.round_no, closesAt: b.closes_at, plannedClose: b.planned_close }, lang, t),
      };
    }),
  };
}

/** One bill with every number on it, or null. */
export async function getBill(billId: number) {
  const { lang, t } = await getI18n();
  const viewer = await requireEmployee("members.view");
  await io();
  if (!Number.isSafeInteger(billId) || billId <= 0) return null;
  const b = await q1<BillRow & { discount: number; note: string | null; settled_at: number | null }>(
    `SELECT ${COLUMNS}, b.discount, b.note, b.settled_at ${BILLS} WHERE b.id = ?`,
    billId,
  );
  if (!b) return null;
  const [items, lottos] = await Promise.all([
    q<{ id: number; bet_type: BetTypeCode; number: string; stake: number; rate100: number; segments: string; status: BillStatus; payout: number }>(
      "SELECT id, bet_type, number, stake, rate100, segments, status, payout FROM bill_items WHERE bill_id = ? ORDER BY id",
      billId,
    ),
    listLottos({ includeDisabled: true }),
  ]);
  const lotto = lottos.find((l) => l.id === b.lotto_id);
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    /** satang: `stake` is what left the wallet, after `discount`. */
    stake: b.total_stake,
    discount: b.discount,
    payout: b.total_payout,
    createdAt: b.created_at,
    settledAt: b.settled_at,
    note: b.note,
    member: { id: b.user_id, name: b.name, phone: contactView(viewer).phone(b.phone) },
    lotto: lotto ? lottoShort(lotto, lang, t) : "-",
    flag: lotto?.flag ?? null,
    round: { id: b.round_id, label: roundName({ roundNo: b.round_no, closesAt: b.closes_at, plannedClose: b.planned_close }, lang, t) },
    items: items.map((i) => ({
      id: i.id,
      betType: i.bet_type,
      number: i.number,
      /** Whole baht; `payout` is satang. */
      stake: i.stake,
      rate100: i.rate100,
      segments: json.parse<Segment[]>(i.segments, []),
      status: i.status,
      payout: i.payout,
    })),
  };
}

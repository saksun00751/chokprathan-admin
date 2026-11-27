import "server-only";
import { io } from "next/cache";
import { maskPhone } from "@/domain/banks";
import { BET_TYPE_ORDER } from "@/core/rules/betTypes";
import { bucketsOf, resolveRange, type DateRange } from "@/domain/periods";
import { groupName } from "@/domain/lotto-groups";
import { reportRoundStatus } from "@/domain/report-status";
import type { BetTypeCode, RoundResult } from "@/core/rules/types";
import { json, q } from "@/server/db";
import { staffSignInCounts } from "@/server/logs";
import { betTypeFigures, sumBetTypes, sumLottos, sumPlaced, sumSettled, sumTx, AFFILIATE_TYPES, CASHBACK_TYPES, rewardsEarned } from "@/server/stats/derive";
import { rangeStats, roundStats, type RangeStats } from "@/server/stats/store";
import { can, type Employee } from "@/server/services/employee-auth";
import { listGroups } from "@/server/services/lotto-groups";
import { listLottos } from "@/server/services/lottos";
import type { Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/dictionaries";
import { fmt, formatDayMonth, formatNumber } from "@/i18n/format";
import { lottoShort, roundName } from "@/i18n/labels";
import { serverI18n } from "@/i18n/server";
import { requireEmployee } from "@/server/session";

export type ColumnKind = "text" | "int" | "baht" | "pct" | "datetime" | "date";
export interface ReportColumn {
  key: string;
  label: string;
  kind: ColumnKind;
  /** sum this column into the totals row */
  total?: boolean;
}
export type ReportCell = string | number | null;
export interface ReportTable {
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  note?: string;
  truncated?: boolean;
}

/** Report ids in menu order; titles, descriptions, and column names live in the admin dictionary (admin.reports). */
export const REPORTS = ["daily", "lottos", "rounds", "bettypes", "players", "registrations", "finance", "promotions", "rewards", "adjustments", "staff"] as const;

export type ReportId = (typeof REPORTS)[number];
export const isReportId = (v: unknown): v is ReportId => (REPORTS as readonly string[]).includes(v as string);

/** Report words plus what the builders need to name lotteries, draws, and days in the request's language. */
type ReportsDict = Dict["admin"]["reports"] & { lang: Locale; t: Dict };

const MAX_ROWS = 2000;

/* ---------------- builders ---------------- */

async function usersById(ids: number[]) {
  const rows = ids.length ? await q<{ id: number; name: string; phone: string | null }>("SELECT id, name, phone FROM users WHERE id IN (?)", ids) : [];
  return new Map(rows.map((r) => [r.id, r]));
}

/** Calendar days of the range with their summary document. */
const perDay = (r: DateRange, s: RangeStats, R: ReportsDict) => {
  const byId = new Map(s.days.map((x) => [x._id, x]));
  return bucketsOf({ ...r, bucket: "day" }, (ms) => formatDayMonth(ms, R.lang)).map((k) => ({ k, x: byId.get(k.key) }));
};

async function daily(r: DateRange, s: RangeStats, R: ReportsDict): Promise<ReportTable> {
  const c = R.daily.cols;
  const players = await s.playersPerDay();
  const rows = perDay(r, s, R).map(({ k, x }) => {
    const d = x ? [x] : [];
    const placed = sumPlaced(d);
    const settled = sumSettled(d);
    const ggr = settled.stake - settled.payout;
    const rewards = sumTx(d, ["bonus", "voucher", ...CASHBACK_TYPES, ...AFFILIATE_TYPES]);
    return {
      day: k.startMs,
      bills: placed.bills,
      players: players.get(k.key) ?? 0,
      turnover: placed.stake,
      settled: settled.stake,
      payout: settled.payout,
      ggr,
      bonus: sumTx(d, ["bonus", "voucher"]),
      cashback: sumTx(d, CASHBACK_TYPES),
      affiliate: sumTx(d, AFFILIATE_TYPES),
      ngr: ggr - rewards,
      deposits: x?.deposits.sum ?? 0,
      withdrawals: x?.withdrawals.sum ?? 0,
      members: x?.members ?? 0,
    };
  });
  return {
    columns: [
      { key: "day", label: c.day, kind: "date" },
      { key: "bills", label: c.bills, kind: "int", total: true },
      { key: "players", label: c.players, kind: "int" },
      { key: "turnover", label: c.turnover, kind: "baht", total: true },
      { key: "settled", label: c.settled, kind: "baht", total: true },
      { key: "payout", label: c.payout, kind: "baht", total: true },
      { key: "ggr", label: c.ggr, kind: "baht", total: true },
      { key: "bonus", label: c.bonus, kind: "baht", total: true },
      { key: "cashback", label: c.cashback, kind: "baht", total: true },
      { key: "affiliate", label: c.affiliate, kind: "baht", total: true },
      { key: "ngr", label: c.ngr, kind: "baht", total: true },
      { key: "deposits", label: c.deposits, kind: "baht", total: true },
      { key: "withdrawals", label: c.withdrawals, kind: "baht", total: true },
      { key: "members", label: c.members, kind: "int", total: true },
    ],
    rows,
    note: R.daily.note,
  };
}

async function byLotto(s: RangeStats, R: ReportsDict): Promise<ReportTable> {
  const c = R.lottos.cols;
  const [lottos, players, groups] = await Promise.all([listLottos({ includeDisabled: true }), s.playersPerLotto(), listGroups()]);
  const groupLabel = (code: string) => {
    const g = groups.find((x) => x.code === code);
    return g ? groupName(g, R.lang, R.t.lotto.groups) : code;
  };
  const rows = [...sumLottos(s.days)].sort(([ia, a], [ib, b]) => b.stake - a.stake || ia - ib);
  return {
    columns: [
      { key: "lotto", label: c.lotto, kind: "text" },
      { key: "group", label: c.group, kind: "text" },
      { key: "rounds", label: c.rounds, kind: "int", total: true },
      { key: "bills", label: c.bills, kind: "int", total: true },
      { key: "players", label: c.players, kind: "int" },
      { key: "turnover", label: c.turnover, kind: "baht", total: true },
      { key: "settled", label: c.settled, kind: "baht", total: true },
      { key: "payout", label: c.payout, kind: "baht", total: true },
      { key: "ggr", label: c.ggr, kind: "baht", total: true },
      { key: "margin", label: c.margin, kind: "pct" },
    ],
    rows: rows.map(([id, x]) => {
      const lotto = lottos.find((l) => l.id === id);
      const ggr = x.settled - x.payout;
      return {
        lotto: lotto ? lottoShort(lotto, R.lang, R.t) : "-",
        group: lotto ? groupLabel(lotto.group) : "-",
        rounds: x.rounds,
        bills: x.bills,
        players: players.get(id) ?? 0,
        turnover: x.stake,
        settled: x.settled,
        payout: x.payout,
        ggr,
        margin: x.settled > 0 ? ggr / x.settled : null,
      };
    }),
  };
}

const resultText = (raw: string | null) => {
  const res = json.parse<RoundResult | null>(raw, null);
  return res ? `${res.first6 ?? res.top4 ?? res.top3} / ${res.bottom2}` : "";
};

async function byRound(r: DateRange, R: ReportsDict): Promise<ReportTable> {
  const c = R.rounds.cols;
  const [lottos, all] = await Promise.all([listLottos({ includeDisabled: true }), roundStats(r)]);
  const rows = all.filter((x) => x.bills > 0).sort((a, b) => b.closesAt - a.closesAt || b._id - a._id);
  return {
    columns: [
      { key: "closes", label: c.closes, kind: "datetime" },
      { key: "lotto", label: c.lotto, kind: "text" },
      { key: "round", label: c.round, kind: "text" },
      { key: "status", label: c.status, kind: "text" },
      { key: "result", label: c.result, kind: "text" },
      { key: "bills", label: c.bills, kind: "int", total: true },
      { key: "turnover", label: c.turnover, kind: "baht", total: true },
      { key: "payout", label: c.payout, kind: "baht", total: true },
      { key: "ggr", label: c.ggr, kind: "baht", total: true },
    ],
    rows: rows.slice(0, MAX_ROWS).map((x) => {
      const lotto = lottos.find((l) => l.id === x.lottoId);
      return {
        closes: x.closesAt,
        lotto: lotto ? lottoShort(lotto, R.lang, R.t) : "-",
        round: roundName({ roundNo: x.roundNo, closesAt: x.closesAt, plannedClose: x.plannedClose ?? null }, R.lang, R.t),
        status: reportRoundStatus(x.status, R.t),
        result: resultText(x.result),
        bills: x.bills,
        turnover: x.stake,
        payout: x.payout,
        ggr: x.status === "resulted" ? x.stake - x.payout : null,
      };
    }),
    truncated: rows.length > MAX_ROWS,
    note: R.rounds.note,
  };
}

function byBetType(s: RangeStats, R: ReportsDict): ReportTable {
  const c = R.bettypes.cols;
  const order = (code: string) => BET_TYPE_ORDER.indexOf(code as BetTypeCode);
  const rows = Object.entries(sumBetTypes(s.days)).sort(([a], [b]) => order(a) - order(b));
  return {
    columns: [
      { key: "type", label: c.type, kind: "text" },
      { key: "items", label: c.items, kind: "int", total: true },
      { key: "won", label: c.won, kind: "int", total: true },
      { key: "turnover", label: c.turnover, kind: "baht", total: true },
      { key: "avgRate", label: c.avgRate, kind: "text" },
      { key: "payout", label: c.payout, kind: "baht", total: true },
      { key: "ggr", label: c.ggr, kind: "baht", total: true },
    ],
    rows: rows.map(([type, x]) => {
      const f = betTypeFigures(x);
      return {
        type: R.t.lotto.betTypes[type as BetTypeCode]?.label ?? type,
        items: x.items,
        won: x.won,
        turnover: f.turnover,
        avgRate: f.avgRate === null ? "-" : `×${f.avgRate.toFixed(1)}`,
        payout: x.payout,
        ggr: f.ggr,
      };
    }),
    note: R.bettypes.note,
  };
}

async function players(s: RangeStats, viewer: Employee, R: ReportsDict): Promise<ReportTable> {
  const c = R.players.cols;
  const top = await s.users({ bettorsOnly: true, sortBy: "stake", limit: 200 });
  const people = await usersById(top.map((x) => x.u));
  const full = can(viewer, "members.contact");
  return {
    columns: [
      { key: "name", label: c.name, kind: "text" },
      { key: "phone", label: c.phone, kind: "text" },
      { key: "bills", label: c.bills, kind: "int", total: true },
      { key: "turnover", label: c.turnover, kind: "baht", total: true },
      { key: "payout", label: c.payout, kind: "baht", total: true },
      { key: "net", label: c.net, kind: "baht", total: true },
      { key: "deposits", label: c.deposits, kind: "baht", total: true },
      { key: "withdrawals", label: c.withdrawals, kind: "baht", total: true },
    ],
    rows: top.map((x) => {
      const p = people.get(x.u);
      return {
        name: p?.name ?? "-",
        phone: full ? (p?.phone ?? null) : maskPhone(p?.phone ?? null),
        bills: x.bills,
        turnover: x.stake,
        payout: x.payout,
        net: x.payout - x.settled,
        deposits: x.dep,
        withdrawals: x.wd,
      };
    }),
    note: R.players.note,
  };
}

function registrations(r: DateRange, s: RangeStats, R: ReportsDict): ReportTable {
  const c = R.registrations.cols;
  return {
    columns: [
      { key: "day", label: c.day, kind: "date" },
      { key: "joined", label: c.joined, kind: "int", total: true },
      { key: "referred", label: c.referred, kind: "int", total: true },
      { key: "ftd", label: c.ftd, kind: "int", total: true },
      { key: "ftdAmount", label: c.ftdAmount, kind: "baht", total: true },
    ],
    rows: perDay(r, s, R).map(({ k, x }) => ({
      day: k.startMs,
      joined: x?.members ?? 0,
      referred: x?.referred ?? 0,
      ftd: x?.ftd.n ?? 0,
      ftdAmount: x?.ftd.sum ?? 0,
    })),
  };
}

async function finance(r: DateRange, viewer: Employee, R: ReportsDict): Promise<ReportTable> {
  const c = R.finance.cols;
  const rows = await q<{ kind: string; id: number; created_at: number; reviewed_at: number | null; status: string; amount: number; bonus: number; name: string; phone: string | null; reviewer: string | null; note: string | null }>(
    `(SELECT 'deposit' AS kind, d.id, d.created_at, d.reviewed_at, d.status, d.amount, d.bonus, u.name, u.phone, s.name AS reviewer, d.note
      FROM deposits d JOIN users u ON u.id = d.user_id LEFT JOIN employees s ON s.id = d.reviewed_by
      WHERE d.created_at >= ? AND d.created_at < ? AND d.status IN ('pending','approved','rejected'))
     UNION ALL
     (SELECT 'withdraw' AS kind, w.id, w.created_at, w.reviewed_at, w.status, w.amount, 0 AS bonus, u.name, u.phone, s.name AS reviewer, w.note
      FROM withdrawals w JOIN users u ON u.id = w.user_id LEFT JOIN employees s ON s.id = w.reviewed_by
      WHERE w.created_at >= ? AND w.created_at < ?)
     ORDER BY created_at DESC LIMIT ${MAX_ROWS + 1}`,
    r.startMs,
    r.endMs,
    r.startMs,
    r.endMs,
  );
  const STATUS: Record<string, string> = R.finance.status;
  const full = can(viewer, "members.contact");
  return {
    columns: [
      { key: "at", label: c.at, kind: "datetime" },
      { key: "kind", label: c.kind, kind: "text" },
      { key: "ref", label: c.ref, kind: "text" },
      { key: "name", label: c.name, kind: "text" },
      { key: "phone", label: c.phone, kind: "text" },
      { key: "amount", label: c.amount, kind: "baht" },
      { key: "bonus", label: c.bonus, kind: "baht", total: true },
      { key: "status", label: c.status, kind: "text" },
      { key: "reviewer", label: c.reviewer, kind: "text" },
      { key: "reviewedAt", label: c.reviewedAt, kind: "datetime" },
      { key: "note", label: c.note, kind: "text" },
    ],
    rows: rows.slice(0, MAX_ROWS).map((x) => ({
      at: x.created_at,
      kind: x.kind === "deposit" ? R.finance.deposit : R.finance.withdraw,
      ref: `${x.kind === "deposit" ? "DP" : "WD"}${String(x.id).padStart(6, "0")}`,
      name: x.name,
      phone: full ? x.phone : maskPhone(x.phone),
      amount: x.amount,
      bonus: x.bonus,
      status: STATUS[x.status] ?? x.status,
      reviewer: x.reviewer ?? (x.status === "approved" ? R.finance.auto : ""),
      reviewedAt: x.reviewed_at,
      note: x.note ?? "",
    })),
    truncated: rows.length > MAX_ROWS,
    note: R.finance.note,
  };
}

async function promotions(r: DateRange, R: ReportsDict): Promise<ReportTable> {
  const c = R.promotions.cols;
  const [promos, vouchers] = await Promise.all([
    q<{ title: string; active: number; claims: number; members: number; bonus: number | null }>(
      `SELECT p.title, p.active, COUNT(c.id) AS claims, COUNT(DISTINCT c.user_id) AS members, SUM(c.bonus) AS bonus
       FROM promotions p LEFT JOIN promotion_claims c ON c.promotion_id = p.id AND c.created_at >= ? AND c.created_at < ?
       WHERE p.bonus_percent > 0 GROUP BY p.id, p.title, p.active ORDER BY bonus DESC`,
      r.startMs,
      r.endMs,
    ),
    q<{ code: string; active: number; value: number; used: number; max_uses: number; uses: number }>(
      `SELECT v.code, v.active, v.value, v.used, v.max_uses, COUNT(x.user_id) AS uses
       FROM vouchers v LEFT JOIN voucher_redemptions x ON x.voucher_id = v.id AND x.created_at >= ? AND x.created_at < ?
       GROUP BY v.id, v.code, v.active, v.value, v.used, v.max_uses ORDER BY uses DESC, v.created_at DESC LIMIT 300`,
      r.startMs,
      r.endMs,
    ),
  ]);
  return {
    columns: [
      { key: "name", label: c.name, kind: "text" },
      { key: "kind", label: c.kind, kind: "text" },
      { key: "state", label: c.state, kind: "text" },
      { key: "uses", label: c.uses, kind: "int", total: true },
      { key: "members", label: c.members, kind: "int" },
      { key: "amount", label: c.amount, kind: "baht", total: true },
      { key: "lifetime", label: c.lifetime, kind: "text" },
    ],
    rows: [
      ...promos.map((p) => ({ name: p.title, kind: R.promotions.bonus, state: p.active ? R.promotions.on : R.promotions.off, uses: p.claims, members: p.members, amount: p.bonus ?? 0, lifetime: "" })),
      ...vouchers.map((v) => ({ name: v.code, kind: R.promotions.voucher, state: v.active ? R.promotions.on : R.promotions.off, uses: v.uses, members: v.uses, amount: v.uses * v.value, lifetime: `${formatNumber(v.used)} / ${formatNumber(v.max_uses)}` })),
    ],
  };
}

const REWARD_WALLETS = ["cashback", "affiliate"] as const;

async function rewards(r: DateRange, s: RangeStats, R: ReportsDict): Promise<ReportTable> {
  const c = R.rewards.cols;
  const top = (await s.users({ sortBy: "affEarn", limit: 10 })).filter((x) => x.affEarn > 0);
  const people = await usersById(top.map((x) => x.u));
  const topLine = top
    .map((x) => `${people.get(x.u)?.name ?? "-"} (${maskPhone(people.get(x.u)?.phone ?? null)}) ฿${formatNumber(Math.round(x.affEarn / 100))}`)
    .join(", ");
  return {
    columns: [
      { key: "day", label: c.day, kind: "date" },
      { key: "cashbackEarn", label: c.cashbackEarn, kind: "baht", total: true },
      { key: "cashbackClaim", label: c.cashbackClaim, kind: "baht", total: true },
      { key: "affEarn", label: c.affEarn, kind: "baht", total: true },
      { key: "affClaim", label: c.affClaim, kind: "baht", total: true },
    ],
    rows: perDay(r, s, R).map(({ k, x }) => {
      const d = x ? [x] : [];
      return {
        day: k.startMs,
        cashbackEarn: rewardsEarned(d).cashback,
        cashbackClaim: -sumTx(d, ["cashback_claim"], REWARD_WALLETS),
        affEarn: rewardsEarned(d).affiliate,
        affClaim: -sumTx(d, ["aff_transfer"], REWARD_WALLETS),
      };
    }),
    note: top.length ? fmt(R.rewards.topReferrers, { list: topLine }) : undefined,
  };
}

async function adjustments(r: DateRange, viewer: Employee, R: ReportsDict): Promise<ReportTable> {
  const c = R.adjustments.cols;
  const rows = await q<{ created_at: number; amount: number; balance_after: number; note: string | null; name: string; phone: string | null; staff: string | null }>(
    `SELECT t.created_at, t.amount, t.balance_after, t.note, u.name, u.phone, s.name AS staff
     FROM transactions t JOIN users u ON u.id = t.user_id LEFT JOIN employees s ON s.id = t.actor_id
     WHERE t.type = 'adjust' AND t.created_at >= ? AND t.created_at < ? ORDER BY t.created_at DESC LIMIT ${MAX_ROWS + 1}`,
    r.startMs,
    r.endMs,
  );
  const full = can(viewer, "members.contact");
  return {
    columns: [
      { key: "at", label: c.at, kind: "datetime" },
      { key: "staff", label: c.staff, kind: "text" },
      { key: "name", label: c.name, kind: "text" },
      { key: "phone", label: c.phone, kind: "text" },
      { key: "amount", label: c.amount, kind: "baht", total: true },
      { key: "after", label: c.after, kind: "baht" },
      { key: "note", label: c.note, kind: "text" },
    ],
    rows: rows.slice(0, MAX_ROWS).map((x) => ({
      at: x.created_at,
      staff: x.staff ?? "-",
      name: x.name,
      phone: full ? x.phone : maskPhone(x.phone),
      amount: x.amount,
      after: x.balance_after,
      note: x.note ?? "",
    })),
    truncated: rows.length > MAX_ROWS,
  };
}

/** Audit actions grouped into report columns: [action prefix, column key]. */
const ACTION_GROUPS = [
  ["deposit.", "deposit"],
  ["withdraw.", "withdraw"],
  ["round.", "round"],
  ["member.adjust", "adjust"],
  ["member.", "member"],
  ["risk.", "risk"],
  ["settings.", "settings"],
  ["staff.", "staffActions"],
] as const;

async function staff(r: DateRange, R: ReportsDict): Promise<ReportTable> {
  const c = R.staff.cols;
  const staffUsers = await q<{ id: number; name: string }>("SELECT id, name FROM employees");
  const names = new Map(staffUsers.map((s) => [s.id, s.name]));
  const [actions, logins] = await Promise.all([
    q<{ actor_id: number; name: string; action: string; n: number }>(
      `SELECT a.actor_id, u.name, a.action, COUNT(*) AS n FROM audit_log a JOIN employees u ON u.id = a.actor_id
       WHERE a.created_at >= ? AND a.created_at < ? GROUP BY a.actor_id, u.name, a.action`,
      r.startMs,
      r.endMs,
    ),
    staffSignInCounts([...names.keys()], r).then((rows) => rows.map((x) => ({ ...x, name: names.get(x.user_id) ?? "-" }))),
  ]);
  const people = new Map<number, Record<string, ReportCell>>();
  const row = (id: number, name: string) => {
    let x = people.get(id);
    if (!x) {
      x = { name, logins: 0, failed: 0, lastLogin: null, total: 0, ...Object.fromEntries(ACTION_GROUPS.map(([, key]) => [key, 0])), other: 0 };
      people.set(id, x);
    }
    return x;
  };
  for (const a of actions) {
    const x = row(a.actor_id, a.name);
    const group = ACTION_GROUPS.find(([prefix]) => a.action.startsWith(prefix))?.[1] ?? "other";
    x[group] = Number(x[group] ?? 0) + a.n;
    x.total = Number(x.total) + a.n;
  }
  for (const l of logins) {
    const x = row(l.user_id, l.name);
    if (l.event === "login") {
      x.logins = Number(x.logins) + l.n;
      x.lastLogin = Math.max(Number(x.lastLogin ?? 0), l.last);
    }
    if (l.event === "login_failed" || l.event === "2fa_failed") x.failed = Number(x.failed) + l.n;
  }
  return {
    columns: [
      { key: "name", label: c.name, kind: "text" },
      { key: "logins", label: c.logins, kind: "int", total: true },
      { key: "failed", label: c.failed, kind: "int", total: true },
      { key: "lastLogin", label: c.lastLogin, kind: "datetime" },
      ...ACTION_GROUPS.map(([, key]) => ({ key, label: R.staff.groups[key], kind: "int" as const, total: true })),
      { key: "other", label: c.other, kind: "int", total: true },
      { key: "total", label: c.total, kind: "int", total: true },
    ],
    rows: [...people.values()].sort((a, b) => Number(b.total) - Number(a.total)),
    note: R.staff.note,
  };
}

/* ---------------- entry ---------------- */

export async function getReport(id: ReportId, input: { period?: string; from?: string; to?: string }, { forExport = false } = {}) {
  const viewer = await requireEmployee(forExport ? "reports.export" : "reports.view");
  if (id === "staff") await requireEmployee("audit.view");
  await io();
  const now = Date.now();
  const range = resolveRange(input, now) ?? resolveRange({ period: "7d" }, now)!;
  const { lang, t } = await serverI18n();
  const R: ReportsDict = { ...t.admin.reports, lang, t };
  const meta = { id, ...t.admin.reports.list[id] };
  const stats = () => rangeStats(range, now);
  const table = await (async () => {
    switch (id) {
      case "daily":
        return daily(range, await stats(), R);
      case "lottos":
        return byLotto(await stats(), R);
      case "rounds":
        return byRound(range, R);
      case "bettypes":
        return byBetType(await stats(), R);
      case "players":
        return players(await stats(), viewer, R);
      case "registrations":
        return registrations(range, await stats(), R);
      case "finance":
        return finance(range, viewer, R);
      case "promotions":
        return promotions(range, R);
      case "rewards":
        return rewards(range, await stats(), R);
      case "adjustments":
        return adjustments(range, viewer, R);
      case "staff":
        return staff(range, R);
    }
  })();
  const totals: Record<string, number> = {};
  for (const c of table.columns) if (c.total) totals[c.key] = table.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
  return { meta, range, table, totals, canExport: can(viewer, "reports.export"), viewerId: viewer.id };
}

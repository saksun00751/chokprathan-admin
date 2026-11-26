import "server-only";
import { io } from "next/cache";
import { SELF_DRAWN_SQL } from "@/domain/auto-result";
import { maskPhone } from "@/domain/banks";
import { previousRange, resolveRange, type DateRange } from "@/domain/periods";
import { BKK_OFFSET_MS } from "@/core/rules/time";
import { groupName } from "@/domain/lotto-groups";
import { q, q1 } from "@/server/db";
import { can } from "@/server/services/employee-auth";
import { listGroups } from "@/server/services/lotto-groups";
import { listLottos } from "@/server/services/lottos";
import { limitsForRounds } from "@/server/services/risk";
import type { Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/dictionaries";
import { fmt, formatDayMonth } from "@/i18n/format";
import { lottoName, lottoShort, roundName } from "@/i18n/labels";
import { getI18n } from "@/i18n/rsc";
import { schedulerState } from "@/server/services/scheduler";
import { mongoPing } from "@/server/mongo";
import { seriesOf, sumLottos, sumMoney, sumPlaced, sumSettled, sumTx, AFFILIATE_TYPES, CASHBACK_TYPES } from "@/server/stats/derive";
import { rangeStats, type RangeStats } from "@/server/stats/store";
import { requireEmployee } from "@/server/session";

/** Totals over the range from the summary documents (see server/stats). */
async function bettingTotals(s: RangeStats) {
  const placed = sumPlaced(s.days);
  const settled = sumSettled(s.days);
  return { bills: placed.bills, turnover: placed.stake, players: await s.players(), settledStake: settled.stake, payout: settled.payout, ggr: settled.stake - settled.payout };
}

function rewardCosts(s: RangeStats) {
  const d = s.days;
  return { bonus: sumTx(d, ["bonus"]), voucher: sumTx(d, ["voucher"]), cashback: sumTx(d, CASHBACK_TYPES), affiliate: sumTx(d, AFFILIATE_TYPES), adjust: sumTx(d, ["adjust"]) };
}

function moneyTotals(s: RangeStats) {
  const m = sumMoney(s.days);
  return { deposits: m.deposits, withdrawals: m.withdrawals, newMembers: m.members, firstDeposits: m.ftd.n };
}

/** Values per hour (one day) or per day, with every empty bucket present as zero. */
function series(r: DateRange, s: RangeStats, lang: Locale) {
  return seriesOf(r, s.days, (ms) => formatDayMonth(ms, lang));
}

export type DashboardSeries = ReturnType<typeof series>;

async function breakdowns(s: RangeStats, t: Dict) {
  const [lottos, top, lottoGroups, { lang }] = await Promise.all([
    listLottos({ includeDisabled: true }),
    s.users({ bettorsOnly: true, sortBy: "stake", limit: 10 }),
    listGroups(),
    getI18n(),
  ]);
  const totals = sumLottos(s.days);
  const people = await usersById(top.map((p) => p.u));
  const groupOf = new Map(lottos.map((l) => [l.id, l.group]));
  return {
    groups: lottoGroups.map((g) => {
      const inGroup = [...totals].filter(([id]) => groupOf.get(id) === g.code).map(([, x]) => x);
      return { group: g.code, label: groupName(g, lang, t.lotto.groups), stake: inGroup.reduce((a, x) => a + x.stake, 0), bills: inGroup.reduce((a, x) => a + x.bills, 0) };
    }),
    topLottos: [...totals]
      .sort(([ia, a], [ib, b]) => b.stake - a.stake || ia - ib)
      .slice(0, 8)
      .map(([id, x]) => {
        const lotto = lottos.find((l) => l.id === id);
        return { id, name: lotto ? lottoShort(lotto, t) : "-", flag: lotto?.flag ?? null, bills: x.bills, stake: x.stake, settled: x.settled, payout: x.payout, ggr: x.settled - x.payout };
      }),
    topPlayers: top.map((p) => ({ id: p.u, name: people.get(p.u)?.name ?? "-", phone: maskPhone(people.get(p.u)?.phone ?? null), bills: p.bills, stake: p.stake, payout: p.payout })),
  };
}

async function usersById(ids: number[]) {
  const rows = ids.length ? await q<{ id: number; name: string; phone: string | null }>("SELECT id, name, phone FROM users WHERE id IN (?)", ids) : [];
  return new Map(rows.map((r) => [r.id, r]));
}

async function liveRisk(now: number, lang: Locale, t: Dict) {
  const lottos = await listLottos({ includeDisabled: true });
  const [watch, awaiting] = await Promise.all([
    q<{ id: number; lotto_id: number; round_no: number | null; closes_at: number; planned_close: number | null; liability: number | null; stake: number | null }>(
      `SELECT r.id, r.lotto_id, r.round_no, r.closes_at, r.planned_close,
              (SELECT MAX(potential) FROM exposures e WHERE e.round_id = r.id) AS liability,
              (SELECT SUM(total_stake) FROM bills b WHERE b.round_id = r.id AND b.status = 'pending') AS stake
       FROM rounds r WHERE r.status = 'scheduled' AND r.opens_at <= ? AND r.closes_at > ?
       ORDER BY liability DESC LIMIT 8`,
      now,
      now,
    ),
    q<{ id: number; lotto_id: number; round_no: number | null; closes_at: number; planned_close: number | null }>(
      `SELECT r.id, r.lotto_id, r.round_no, r.closes_at, r.planned_close FROM rounds r JOIN lottos l ON l.id = r.lotto_id
       WHERE r.status = 'scheduled' AND r.closes_at <= ? AND NOT ${SELF_DRAWN_SQL} ORDER BY r.closes_at LIMIT 10`,
      now,
    ),
  ]);
  const cuts = await limitsForRounds(watch.map((w) => w.id));
  const name = (id: number) => lottos.find((l) => l.id === id);
  return {
    watch: watch.map((w) => ({
      id: w.id,
      lotto: ((l) => (l ? lottoShort(l, t) : "-"))(name(w.lotto_id)),
      flag: name(w.lotto_id)?.flag ?? null,
      label: roundName({ roundNo: w.round_no, closesAt: w.closes_at, plannedClose: w.planned_close }, lang, t),
      closesAt: w.closes_at,
      stake: w.stake ?? 0,
      liability: w.liability ?? 0,
      cuts: cuts.get(w.id)?.length ?? 0,
    })),
    awaiting: awaiting.map((a) => ({
      id: a.id,
      lotto: ((l) => (l ? lottoName(l, t) : "-"))(name(a.lotto_id)),
      flag: name(a.lotto_id)?.flag ?? null,
      label: roundName({ roundNo: a.round_no, closesAt: a.closes_at, plannedClose: a.planned_close }, lang, t),
      closesAt: a.closes_at,
    })),
  };
}

async function queues() {
  const r = await q1<{ dn: number; ds: number | null; wn: number; ws: number | null; pending: number | null; pendingBills: number }>(
    `SELECT
       (SELECT COUNT(*) FROM deposits WHERE status = 'pending') AS dn,
       (SELECT SUM(amount) FROM deposits WHERE status = 'pending') AS ds,
       (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') AS wn,
       (SELECT SUM(amount) FROM withdrawals WHERE status = 'pending') AS ws,
       (SELECT SUM(total_stake) FROM bills WHERE status = 'pending') AS pending,
       (SELECT COUNT(*) FROM bills WHERE status = 'pending') AS pendingBills`,
  );
  return {
    deposits: { n: r?.dn ?? 0, sum: r?.ds ?? 0 },
    withdrawals: { n: r?.wn ?? 0, sum: r?.ws ?? 0 },
    pendingStake: r?.pending ?? 0,
    pendingBills: r?.pendingBills ?? 0,
  };
}

async function liabilities() {
  const r = await q1<{ b: number | null; c: number | null; a: number | null; n: number }>(
    "SELECT SUM(balance) AS b, SUM(cashback_balance) AS c, SUM(affiliate_balance) AS a, COUNT(*) AS n FROM users WHERE role = 'member' AND is_simulated = 0",
  );
  return { balance: r?.b ?? 0, cashback: r?.c ?? 0, affiliate: r?.a ?? 0, members: r?.n ?? 0 };
}

export interface HealthCheck {
  id: string;
  label: string;
  state: "good" | "warning" | "critical";
  detail: string;
}

async function health(now: number, t: Dict): Promise<HealthCheck[]> {
  const c = t.admin.dashboard.checks;
  const t0 = performance.now();
  const ping = await q1<{ v: string }>("SELECT VERSION() AS v");
  const dbMs = Math.round(performance.now() - t0);
  const [mongo, sched, unsettled, overdue] = await Promise.all([
    mongoPing(),
    q1<{ value: string; updated_at: number }>("SELECT `value`, updated_at FROM system_status WHERE name = 'scheduler'"),
    q1<{ n: number }>("SELECT COUNT(*) AS n FROM rounds WHERE status IN ('resulted','cancelled') AND settled_at IS NULL"),
    q1<{ n: number }>(
      `SELECT COUNT(*) AS n FROM rounds r JOIN lottos l ON l.id = r.lotto_id
       WHERE r.status = 'scheduled' AND ${SELF_DRAWN_SQL} AND r.draw_at < ?`,
      now - 5 * 60_000,
    ),
  ]);
  const schedAge = sched ? now - sched.updated_at : Infinity;
  const local = schedulerState();
  const mem = process.memoryUsage();
  return [
    {
      id: "db",
      label: c.db,
      state: dbMs < 50 ? "good" : dbMs < 250 ? "warning" : "critical",
      detail: fmt(c.dbDetail, { version: ping?.v?.split("-")[0] ?? "MariaDB", ms: dbMs }),
    },
    {
      id: "mongo",
      label: c.mongo,
      state: mongo.state === "up" ? (mongo.ms < 50 ? "good" : mongo.ms < 250 ? "warning" : "critical") : mongo.state === "off" ? "warning" : "critical",
      detail: mongo.state === "up" ? fmt(c.mongoDetail, { version: mongo.version, ms: mongo.ms }) : mongo.state === "off" ? c.mongoOff : c.mongoDown,
    },
    {
      id: "scheduler",
      label: c.scheduler,
      state: schedAge < 90_000 ? "good" : schedAge < 300_000 ? "warning" : "critical",
      detail: Number.isFinite(schedAge) ? `${fmt(c.schedulerDetail, { s: Math.round(schedAge / 1000) })}${local.running ? "" : c.notHere}` : c.never,
    },
    {
      id: "settlement",
      label: c.settlement,
      state: (unsettled?.n ?? 0) === 0 ? "good" : "warning",
      detail: (unsettled?.n ?? 0) === 0 ? c.settled : fmt(c.settling, { n: unsettled!.n }),
    },
    {
      id: "auto",
      label: c.auto,
      state: (overdue?.n ?? 0) === 0 ? "good" : "critical",
      detail: (overdue?.n ?? 0) === 0 ? c.noOverdue : fmt(c.overdue, { n: overdue!.n }),
    },
    {
      id: "app",
      label: c.app,
      state: mem.rss < 1.5 * 1024 ** 3 ? "good" : "warning",
      detail: fmt(c.appDetail, { version: process.version, mb: Math.round(mem.rss / 1024 ** 2), h: Math.round(process.uptime() / 3600) }),
    },
  ];
}

const change = (now: number, before: number) => (before === 0 ? (now === 0 ? 0 : null) : (now - before) / Math.abs(before));

export async function getDashboard(input: { period?: string; from?: string; to?: string }) {
  const viewer = await requireEmployee("dashboard.view");
  const { lang, t } = await getI18n();
  await io();
  const now = Date.now();
  const range = resolveRange(input, now) ?? resolveRange({ period: "today" }, now)!;
  const prev = previousRange(range);
  const show = {
    money: can(viewer, "reports.view"),
    finance: can(viewer, "finance.view"),
    members: can(viewer, "members.view") || can(viewer, "reports.view"),
    risk: can(viewer, "rounds.view"),
  };

  const needStats = show.money || show.finance || show.members;
  const [stats, statsPrev] = needStats ? await Promise.all([rangeStats(range, now), rangeStats(prev, now)]) : [null, null];
  const [betting, bettingPrev, breakdown, risk, queue, owed, checks] = await Promise.all([
    show.money && stats ? bettingTotals(stats) : null,
    show.money && statsPrev ? bettingTotals(statsPrev) : null,
    show.money && stats ? breakdowns(stats, t) : null,
    show.risk ? liveRisk(now, lang, t) : null,
    show.finance || show.money ? queues() : null,
    show.money ? liabilities() : null,
    health(now, t),
  ]);
  const costs = show.money && stats ? rewardCosts(stats) : null;
  const money = (show.finance || show.members) && stats ? moneyTotals(stats) : null;
  const moneyPrev = (show.finance || show.members) && statsPrev ? moneyTotals(statsPrev) : null;
  const chart = (show.money || show.finance) && stats ? series(range, stats, lang) : null;

  const rewardTotal = costs ? costs.bonus + costs.voucher + costs.cashback + costs.affiliate : 0;
  return {
    serverNow: now,
    range,
    show,
    betting: betting && {
      ...betting,
      margin: betting.settledStake > 0 ? betting.ggr / betting.settledStake : null,
      ngr: betting.ggr - rewardTotal,
      change: {
        turnover: change(betting.turnover, bettingPrev!.turnover),
        ggr: change(betting.ggr, bettingPrev!.ggr),
        payout: change(betting.payout, bettingPrev!.payout),
        players: change(betting.players, bettingPrev!.players),
      },
    },
    costs: costs && { ...costs, total: rewardTotal },
    money: money && {
      ...money,
      net: money.deposits.sum - money.withdrawals.sum,
      change: {
        deposits: change(money.deposits.sum, moneyPrev!.deposits.sum),
        withdrawals: change(money.withdrawals.sum, moneyPrev!.withdrawals.sum),
        newMembers: change(money.newMembers, moneyPrev!.newMembers),
        firstDeposits: change(money.firstDeposits, moneyPrev!.firstDeposits),
      },
    },
    chart,
    breakdown,
    risk,
    queue,
    owed,
    health: checks,
    offset: BKK_OFFSET_MS,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

import "server-only";
// Authorization lives here, next to the data: Next renders layouts and pages in parallel,
// so the admin layout gate alone does not stop a page from reading admin data.
import { io } from "next/cache";
import { SELF_DRAWN_SQL } from "@/domain/auto-result";
import { maskAccount, maskPhone } from "@/domain/banks";
import type { LottoGroupInfo } from "@/domain/lotto-groups";
import { dayKey, dayStartMs } from "chokprathan-core/rules/time";
import type { LottoGroup, ResultFormat } from "chokprathan-core/rules/types";
import { json, q, q1, tolerateMissingTable } from "@/server/db";
import { can, type Employee } from "@/server/services/employee-auth";
import { listBanners } from "@/server/services/banners";
import type { DepositRow, WithdrawalRow } from "@/server/services/finance";
import { listGroups } from "@/server/services/lotto-groups";
import { getLotto, listLottos, type Lotto } from "@/server/services/lottos";
import { listDebts } from "@/server/services/debts";
import { listPackages } from "@/server/services/packages";
import { exposureTable, manualLimitList, roundBetConfigs, roundTotals } from "@/server/services/risk";
import { lottoName, lottoShort, roundName } from "@/i18n/labels";
import { getI18n } from "@/i18n/rsc";
import { getRound, phaseOf, toRound, type RoundPhase, type RoundRow } from "@/server/services/rounds";
import { pointsOf } from "@/server/services/points";
import { gameHistory } from "@/server/data/game-history";
import { blockedAmong, blocksFor, listBlocks, type BlockRow } from "@/server/services/blocklist";
import { isBlockKind, type Identity } from "@/domain/blocklist";
import { getSetting, getSettings } from "@/server/services/settings";
import { listRoles, listStaff } from "@/server/services/employees";
import { recentStaffSignIns } from "@/server/logs";
import { auditIntegrity } from "@/server/services/audit";
import { bankMoves, listBankAccounts, payoutAccounts } from "@/server/services/banks";
import { getEmployee, loginUrl, needsTotpSetup, requireEmployee } from "@/server/session";
import { redirect } from "next/navigation";

/** Whether the SMS provider the member app sends one-time codes with is configured in this environment. */
const smsConfigured = () => {
  const p = process.env.SMS_PROVIDER;
  if (p === "thaibulksms") return !!(process.env.THAIBULKSMS_API_KEY && process.env.THAIBULKSMS_API_SECRET);
  return p === "log" && process.env.NODE_ENV !== "production";
};

/** Phone and bank numbers in full only for staff allowed to contact members or pay them. */
const contactView = (viewer: Employee) => {
  const full = can(viewer, "members.contact");
  return {
    phone: (p: string | null) => (full ? p : p ? maskPhone(p) : null),
    account: (a: string | null) => (full ? a : a ? maskAccount(a) : null),
  };
};

export interface AdminRoundRow {
  id: number;
  lotto: string;
  flag: string | null;
  label: string;
  opensAt: number;
  closesAt: number;
  phase: RoundPhase;
  bills: number;
  stake: number;
  result: string | null;
}

export async function getAdminRounds({ day: dayParam, lottoId, phase }: { day?: string; lottoId?: number; phase?: RoundPhase | "all" }) {
  const { lang, t } = await getI18n();
  await requireEmployee("rounds.view");
  await io();
  const now = Date.now();
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : dayKey(now);
  const [rows, lottos] = await Promise.all([
    q<RoundRow & { bills: number; stake: number | null }>(
      `SELECT r.*,
              (SELECT COUNT(*) FROM bills b WHERE b.round_id = r.id AND b.status != 'cancelled') AS bills,
              (SELECT SUM(total_stake) FROM bills b WHERE b.round_id = r.id AND b.status IN ('pending','won','lost')) AS stake
       FROM rounds r WHERE r.day_key = ? ${lottoId ? "AND r.lotto_id = ?" : ""} ORDER BY r.closes_at LIMIT 400`,
      ...(lottoId ? [day, lottoId] : [day]),
    ),
    listLottos({ includeDisabled: true }),
  ]);
  const byId = new Map(lottos.map((l) => [l.id, l]));
  const list: AdminRoundRow[] = rows.flatMap((row) => {
    const r = toRound(row);
    const p = phaseOf(r, now);
    if (phase && phase !== "all" && p !== phase) return [];
    const lotto = byId.get(r.lottoId);
    if (!lotto) return [];
    const res = r.result;
    return [
      {
        id: r.id,
        lotto: lottoShort(lotto, t),
        flag: lotto.flag,
        label: roundName(r, lang, t),
        opensAt: r.opensAt,
        closesAt: r.closesAt,
        phase: p,
        bills: row.bills,
        stake: row.stake ?? 0,
        result: res ? `${res.first6 ?? res.top4 ?? res.top3} / ${res.bottom2}` : null,
      },
    ];
  });
  // The lotteries a round can be made for by hand; empty for staff who may not do that.
  const creatable = can(await requireEmployee("rounds.view"), "lottos.manage")
    ? lottos.filter((l) => l.enabled).map((l) => ({ id: l.id, name: lottoShort(l, t), delayMin: l.resultDelayMin }))
    : [];
  return { serverNow: now, day, rounds: list, lottos: lottos.map((l) => ({ id: l.id, name: lottoShort(l, t) })), creatable };
}

/** Rounds past their close time that still wait for a result typed in by staff. */
/** A draw this long after its draw time with no confirmed result is marked late. */
const LATE_AFTER_MS = 30 * 60_000;

/** The two result queues: rounds to type, and typed results waiting for a second person. */
export async function getAwaitingResults() {
  const { lang, t } = await getI18n();
  const signedIn = await getEmployee();
  // Either permission opens the page; each queue's actions check their own.
  const opening = (["rounds.result", "rounds.confirm", "rounds.correct"] as const).find((p) => signedIn && can(signedIn, p)) ?? "rounds.result";
  const viewer = await requireEmployee(opening);
  await io();
  const now = Date.now();
  const canEnter = can(viewer, "rounds.result");
  const [changes, rows, waiting, lottos] = await Promise.all([
    can(viewer, "rounds.correct")
      ? q<RoundRow & { bills: number }>(
          `SELECT r.*, (SELECT COUNT(*) FROM bills b WHERE b.round_id = r.id AND b.status IN ('won','lost')) AS bills
           FROM rounds r JOIN round_results p ON p.round_id = r.id AND p.status = 'pending' AND p.kind IN ('correction','cancel')
           ORDER BY p.entered_at LIMIT 50`,
        )
      : Promise.resolve([]),
    canEnter
      ? q<RoundRow & { bills: number }>(
          `SELECT r.*, (SELECT COUNT(*) FROM bills b WHERE b.round_id = r.id AND b.status = 'pending') AS bills
           FROM rounds r JOIN lottos l ON l.id = r.lotto_id
           WHERE r.status = 'scheduled' AND r.closes_at <= ? AND NOT ${SELF_DRAWN_SQL}
           ORDER BY r.closes_at LIMIT 100`,
          now,
        )
      : Promise.resolve([]),
    // The typed result itself is never selected: the second person must not see it.
    q<RoundRow & { bills: number; entered_by: number | null; entered_at: number; entered_name: string | null }>(
      `SELECT r.*, (SELECT COUNT(*) FROM bills b WHERE b.round_id = r.id AND b.status = 'pending') AS bills,
              p.entered_by, p.entered_at, COALESCE(NULLIF(e.name, ''), e.username) AS entered_name
       FROM rounds r JOIN round_results p ON p.round_id = r.id AND p.status = 'pending'
       LEFT JOIN employees e ON e.id = p.entered_by
       WHERE r.status = 'pending_confirm' ORDER BY r.closes_at LIMIT 100`,
    ),
    listLottos({ includeDisabled: true }),
  ]);
  const byId = new Map(lottos.map((l) => [l.id, l]));
  const view = (row: RoundRow & { bills: number }) => {
    const r = toRound(row);
    const lotto = byId.get(r.lottoId);
    if (!lotto) return null;
    return {
      id: r.id,
      lotto: lottoName(lotto, t),
      shortName: lottoShort(lotto, t),
      flag: lotto.flag,
      format: lotto.format as ResultFormat,
      label: roundName(r, lang, t),
      closesAt: r.closesAt,
      drawAt: r.drawAt,
      late: now > r.drawAt + LATE_AFTER_MS,
      bills: row.bills,
    };
  };
  return {
    serverNow: now,
    canConfirm: can(viewer, "rounds.confirm"),
    rounds: rows.flatMap((row) => view(row) ?? []),
    corrections: changes.flatMap((row) => view(row) ?? []),
    pending: waiting.flatMap((row) => {
      const v = view(row);
      return v ? [{ ...v, enteredBy: row.entered_name ?? "-", enteredAt: row.entered_at, mine: row.entered_by === viewer.id }] : [];
    }),
  };
}

export async function getAdminRound(roundId: number) {
  const { lang, t } = await getI18n();
  const viewer = await requireEmployee("rounds.view");
  await io();
  const now = Date.now();
  const round = await getRound(roundId);
  if (!round) return null;
  const lotto = (await getLotto(round.lottoId))!;
  const canCorrect = can(viewer, "rounds.correct");
  const [change, lastRun, waiting, totals, liability, exposure, manual] = await Promise.all([
    // A correction waiting for approval. The corrected digits are never selected.
    canCorrect
      ? q1<{ id: number; kind: "correction" | "cancel"; reason: string | null; entered_by: number | null; entered_at: number; entered_name: string | null }>(
          `SELECT p.id, p.kind, p.reason, p.entered_by, p.entered_at, COALESCE(NULLIF(e.name, ''), e.username) AS entered_name
           FROM round_results p LEFT JOIN employees e ON e.id = p.entered_by
           WHERE p.round_id = ? AND p.status = 'pending' AND p.kind IN ('correction','cancel') ORDER BY p.id DESC LIMIT 1`,
          roundId,
        )
      : Promise.resolve(undefined),
    q1<{ status: string }>("SELECT status FROM settlement_runs WHERE round_id = ? ORDER BY id DESC LIMIT 1", roundId),
    // Who typed it and when, never the digits.
    round.status === "pending_confirm"
      ? q1<{ entered_by: number | null; entered_at: number; entered_name: string | null }>(
          `SELECT p.entered_by, p.entered_at, COALESCE(NULLIF(e.name, ''), e.username) AS entered_name
           FROM round_results p LEFT JOIN employees e ON e.id = p.entered_by
           WHERE p.round_id = ? AND p.status = 'pending' ORDER BY p.id DESC LIMIT 1`,
          roundId,
        )
      : Promise.resolve(undefined),
    roundTotals(roundId),
    q<{ bet_type: string; max: number; stake: number }>(
      "SELECT bet_type, MAX(potential) AS max, SUM(total_stake) AS stake FROM exposures WHERE round_id = ? AND total_stake > 0 GROUP BY bet_type",
      roundId,
    ),
    exposureTable(roundId, { limit: 80 }),
    manualLimitList(roundId),
  ]);
  return {
    serverNow: now,
    canResult: can(viewer, "rounds.result"),
    // Only a draw that already has bills keeps old prices; the others follow the settings by themselves.
    canApplyConfig: can(viewer, "lottos.manage") && round.status === "scheduled" && now < round.closesAt && totals.bills > 0,
    // Only a draw that is resulted and fully paid can be asked to change.
    correction:
      canCorrect && round.status === "resulted" && (change !== undefined || (round.settledAt !== null && lastRun?.status === "done"))
        ? {
            pending: change
              ? {
                  id: change.id,
                  kind: change.kind,
                  reason: change.reason ?? "",
                  requestedBy: change.entered_name ?? "-",
                  requestedAt: change.entered_at,
                  mine: change.entered_by === viewer.id,
                }
              : null,
          }
        : null,
    mismatch: lastRun?.status === "mismatch",
    canConfirm: can(viewer, "rounds.confirm"),
    pending: waiting ? { enteredBy: waiting.entered_name ?? "-", enteredAt: waiting.entered_at, mine: waiting.entered_by === viewer.id } : null,
    canCancel: can(viewer, "rounds.cancel"),
    canLimit: can(viewer, "risk.manage"),
    round: {
      id: round.id,
      label: roundName(round, lang, t),
      opensAt: round.opensAt,
      closesAt: round.closesAt,
      drawAt: round.drawAt,
      phase: phaseOf(round, now),
      result: round.result,
      resultedAt: round.resultedAt,
    },
    lotto: {
      id: lotto.id,
      name: lottoName(lotto, t),
      flag: lotto.flag,
      format: lotto.format as ResultFormat,
      autoResult: lotto.autoResult,
      group: lotto.group as LottoGroup,
    },
    configs: (await roundBetConfigs(roundId)).map((c) => ({
      code: c.code,
      label: t.lotto.betTypes[c.code].label,
      short: t.lotto.betTypes[c.code].short,
      digits: c.digits,
      rate100: c.rate100,
    })),
    totals: { stake: totals.stake ?? 0, bills: totals.bills, members: totals.members },
    liability: liability.map((l) => ({ betType: l.bet_type, max: l.max, stake: l.stake })),
    exposure,
    manual,
  };
}

export async function getMembers(search: string, limit = 100) {
  const viewer = await requireEmployee("members.view");
  await io();
  const s = search.trim().slice(0, 40);
  const like = `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await q<{
    id: number;
    phone: string | null;
    name: string;
    status: string;
    balance: number;
    created_at: number;
    last_login_at: number | null;
    bets: number | null;
  }>(
    `SELECT u.id, u.phone, u.name, u.status, u.balance, u.created_at, u.last_login_at,
            (SELECT SUM(total_stake) FROM bills b WHERE b.user_id = u.id AND b.status IN ('won','lost','pending')) AS bets
     FROM users u WHERE u.role = 'member' AND u.is_simulated = 0 ${s ? "AND (u.phone LIKE ? OR u.name LIKE ? OR u.ref_code = ?)" : ""}
     ORDER BY u.created_at DESC LIMIT ?`,
    ...(s ? [like, like, s.toUpperCase(), limit] : [limit]),
  );
  const view = contactView(viewer);
  return rows.map((r) => ({ ...r, phone: view.phone(r.phone) }));
}

export async function getMember(userId: number) {
  const { lang, t } = await getI18n();
  const viewer = await requireEmployee("members.view");
  await io();
  const user = await q1<{
    id: number;
    phone: string | null;
    name: string;
    role: string;
    status: string;
    bank_code: string | null;
    bank_account: string | null;
    bank_name: string | null;
    ref_code: string;
    balance: number;
    cashback_balance: number;
    affiliate_balance: number;
    turnover_required: number;
    created_at: number;
    last_login_at: number | null;
    last_ip: string | null;
    upline1_id: number | null;
    staff_note: string | null;
    first_deposit_at: number | null;
    closed_at: number | null;
    closed_by: number | null;
    close_reason: string | null;
  }>(
    `SELECT id, phone, name, role, status, bank_code, bank_account, bank_name, ref_code, balance, cashback_balance, affiliate_balance,
            turnover_required, created_at, last_login_at, last_ip, upline1_id, staff_note, first_deposit_at, closed_at, closed_by, close_reason
     FROM users WHERE id = ? AND role = 'member'`,
    userId,
  );
  if (!user) return null;
  const [totals, money, bills, tx, upline, lottos, adjustments, closedBy] = await Promise.all([
    q1<{ stake: number | null; payout: number | null; n: number }>(
      "SELECT SUM(total_stake) AS stake, SUM(total_payout) AS payout, COUNT(*) AS n FROM bills WHERE user_id = ? AND status IN ('won','lost')",
      userId,
    ),
    q1<{ dep: number | null; wd: number | null }>(
      `SELECT (SELECT SUM(amount) FROM deposits WHERE user_id = ? AND status = 'approved') AS dep,
              (SELECT SUM(amount) FROM withdrawals WHERE user_id = ? AND status = 'approved') AS wd`,
      userId,
      userId,
    ),
    q<{
      id: number;
      code: string;
      status: string;
      total_stake: number;
      total_payout: number;
      created_at: number;
      lotto_id: number;
      round_no: number | null;
      closes_at: number;
      planned_close: number | null;
    }>(
      `SELECT b.id, b.code, b.status, b.total_stake, b.total_payout, b.created_at, r.lotto_id, r.round_no, r.closes_at, r.planned_close
       FROM bills b JOIN rounds r ON r.id = b.round_id WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 15`,
      userId,
    ),
    q<{ id: number; wallet: string; type: string; amount: number; balance_after: number; ref: string | null; note: string | null; created_at: number }>(
      "SELECT id, wallet, type, amount, balance_after, ref, note, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20",
      userId,
    ),
    user.upline1_id
      ? q1<{ id: number; phone: string | null; name: string }>("SELECT id, phone, name FROM users WHERE id = ?", user.upline1_id)
      : Promise.resolve(undefined),
    listLottos({ includeDisabled: true }),
    // Every staff change to this member's balance: who, how much, and why.
    q<{ id: number; amount: number; balance_after: number; note: string | null; created_at: number; staff: string | null }>(
      `SELECT t.id, t.amount, t.balance_after, t.note, t.created_at, COALESCE(s.username, s.name) AS staff
       FROM transactions t LEFT JOIN employees s ON s.id = t.actor_id
       WHERE t.user_id = ? AND t.type = 'adjust' ORDER BY t.id DESC LIMIT 50`,
      userId,
    ),
    user.closed_by ? q1<{ name: string }>("SELECT COALESCE(username, name) AS name FROM employees WHERE id = ?", user.closed_by) : Promise.resolve(undefined),
  ]);
  const view = contactView(viewer);
  const [debts, points, pointRule, blocks, games] = await Promise.all([
    listDebts(userId),
    pointsOf(userId, 50),
    getSetting("points"),
    // Checked on the real details, before anything is masked for this viewer.
    blocksFor({ phone: user.phone, bankCode: user.bank_code, bankAccount: user.bank_account, name: user.name, bankName: user.bank_name }),
    gameHistory(userId, lang, 20),
  ]);
  return {
    user: { ...user, phone: view.phone(user.phone), bank_account: view.account(user.bank_account), closed_by_name: closedBy?.name ?? null },
    points: points.points,
    pointMoves: points.moves.map((m) => ({ ...m, before: Number(m.balance_after) - Number(m.amount) })),
    pointRule,
    games,
    debts,
    /** active blocklist entries this member matches; phone and account shown only to members.contact */
    blocks: blocks.map((b) => ({
      id: b.id,
      kind: b.kind,
      bankCode: b.bank_code,
      display: b.kind === "phone" ? (view.phone(b.display) ?? "") : b.kind === "bank" ? (view.account(b.display) ?? "") : b.display,
      reason: b.reason,
      createdAt: b.created_at,
      creator: b.creator,
    })),
    adjustments: adjustments.map((a) => ({ ...a, before: Number(a.balance_after) - Number(a.amount) })),
    totals: { stake: totals?.stake ?? 0, payout: totals?.payout ?? 0, bills: totals?.n ?? 0, deposits: money?.dep ?? 0, withdrawals: money?.wd ?? 0 },
    bills: bills.map((b) => ({
      id: b.id,
      code: b.code,
      status: b.status,
      total_stake: b.total_stake,
      total_payout: b.total_payout,
      created_at: b.created_at,
      lotto: ((l) => (l ? lottoShort(l, t) : "-"))(lottos.find((l) => l.id === b.lotto_id)),
      label: roundName({ roundNo: b.round_no, closesAt: b.closes_at, plannedClose: b.planned_close }, lang, t),
    })),
    tx,
    upline: upline ? { ...upline, phone: view.phone(upline.phone) } : null,
    can: {
      writeOff: can(viewer, "finance.writeoff"),
      manage: can(viewer, "members.manage"),
      adjust: can(viewer, "members.adjust"),
      edit: can(viewer, "members.edit"),
      close: can(viewer, "members.delete"),
      points: can(viewer, "members.points"),
      block: can(viewer, "members.block"),
      /** editors without this see blank phone/account fields ("keep") instead of the full values */
      contact: can(viewer, "members.contact"),
    },
  };
}

type QueueUser = { phone: string | null; name: string; bank_code: string | null; bank_account: string | null; bank_name: string | null; blocked: boolean };

export async function getFinanceQueues() {
  const viewer = await requireEmployee("finance.view");
  await io();
  const withUser = `u.phone AS u_phone, u.name AS u_name, u.bank_code AS u_bank_code, u.bank_account AS u_bank_account, u.bank_name AS u_bank_name`;
  type Joined<T> = T & { u_phone: string | null; u_name: string; u_bank_code: string | null; u_bank_account: string | null; u_bank_name: string | null };
  const [deposits, withdrawals, recentDeposits, recentWithdrawals] = await Promise.all([
    q<Joined<DepositRow>>(
      `SELECT d.*, ${withUser} FROM deposits d JOIN users u ON u.id = d.user_id WHERE d.status = 'pending' ORDER BY d.created_at LIMIT 200`,
    ),
    q<Joined<WithdrawalRow>>(
      `SELECT w.*, ${withUser} FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.status = 'pending' ORDER BY w.created_at LIMIT 200`,
    ),
    q<Joined<DepositRow>>(
      `SELECT d.*, ${withUser} FROM deposits d JOIN users u ON u.id = d.user_id WHERE d.status IN ('approved','rejected') ORDER BY d.reviewed_at DESC LIMIT 15`,
    ),
    q<Joined<WithdrawalRow>>(
      `SELECT w.*, ${withUser} FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.status IN ('approved','rejected') ORDER BY w.reviewed_at DESC LIMIT 15`,
    ),
  ]);
  // Members on the blocklist get a warning beside each of their requests (checked on the real details).
  const people = new Map<number, Identity>();
  for (const r of [...deposits, ...withdrawals]) {
    people.set(r.user_id, { phone: r.u_phone, bankCode: r.u_bank_code, bankAccount: r.u_bank_account, name: r.u_name, bankName: r.u_bank_name });
  }
  const blocked = await blockedAmong(people);
  // Paying a withdrawal needs the full account number; everyone else sees it masked.
  const view = contactView(viewer);
  const payer = can(viewer, "finance.withdraw");
  const shape = <T extends { user_id: number }>(row: Joined<T>, fullAccount: boolean) => {
    const { u_phone, u_name, u_bank_code, u_bank_account, u_bank_name, ...rest } = row;
    const user: QueueUser = {
      phone: view.phone(u_phone),
      name: u_name,
      bank_code: u_bank_code,
      bank_account: fullAccount ? u_bank_account : view.account(u_bank_account),
      bank_name: u_bank_name,
      blocked: blocked.has(row.user_id),
    };
    return { ...(rest as unknown as T), user };
  };
  return {
    serverNow: Date.now(),
    can: { deposit: can(viewer, "finance.deposit"), withdraw: payer },
    /** website accounts a withdrawal can be paid from (only for staff who pay) */
    payFrom: payer ? (await payoutAccounts()).map((a) => ({ id: a.id, bankCode: a.bankCode, accountNo: a.accountNo, accountName: a.accountName })) : [],
    deposits: deposits.map((d) => shape(d, false)),
    withdrawals: withdrawals.map((w) => {
      const s = shape(w, payer);
      return { ...s, bank_account: payer ? s.bank_account : maskAccount(s.bank_account) };
    }),
    recentDeposits: recentDeposits.map((d) => shape(d, false)),
    recentWithdrawals: recentWithdrawals.map((w) => {
      const s = shape(w, false);
      return { ...s, bank_account: payer ? s.bank_account : maskAccount(s.bank_account) };
    }),
  };
}

export async function getRiskSettings() {
  await requireEmployee("risk.manage");
  await io();
  const s = await getSettings();
  return { rates: s.rates, risk: s.risk, limits: s.limits };
}

export async function getAdminLottos(): Promise<Lotto[]> {
  await requireEmployee("lottos.manage");
  await io();
  return listLottos({ includeDisabled: true });
}

export async function getAdminPackages() {
  const { t } = await getI18n();
  await requireEmployee("lottos.manage");
  await io();
  const [packages, lottos] = await Promise.all([listPackages(), listLottos({ includeDisabled: true })]);
  return { packages, lottos: lottos.map((l) => ({ id: l.id, name: lottoName(l, t), format: l.format as ResultFormat })) };
}

export async function getAdminLottoGroups(): Promise<LottoGroupInfo[]> {
  await requireEmployee("lottos.manage");
  await io();
  return listGroups();
}

export async function getAdminContent() {
  await requireEmployee("promotions.manage");
  await io();
  const [promotions, vouchers] = await Promise.all([
    q<{
      id: number;
      title: string;
      summary: string;
      details: string;
      bonus_percent: number;
      max_bonus: number;
      min_deposit: number;
      turnover_x: number;
      once_per_user: number;
      active: number;
      sort: number;
      i18n: string | null;
    }>("SELECT * FROM promotions ORDER BY sort, id"),
    q<{ id: number; code: string; value: number; max_uses: number; used: number; expires_at: number | null; active: number; note: string | null }>(
      "SELECT * FROM vouchers ORDER BY created_at DESC LIMIT 200",
    ),
  ]);
  return { promotions: promotions.map(({ i18n, ...p }) => ({ ...p, i18n: json.parse<Record<string, Record<string, string>>>(i18n, {}) })), vouchers };
}

export async function getAdminNews() {
  await requireEmployee("content.manage");
  await io();
  const rows = await q<{ id: number; title: string; body: string; pinned: number; published: number; created_at: number; i18n: string | null }>(
    "SELECT * FROM news ORDER BY pinned DESC, created_at DESC LIMIT 200",
  );
  return rows.map(({ i18n, ...n }) => ({ ...n, i18n: json.parse<Record<string, Record<string, string>>>(i18n, {}) }));
}

export async function getAllSettings() {
  const viewer = await requireEmployee("settings.manage");
  await io();
  const s = await getSettings();
  return {
    site: s.site,
    wallet: s.wallet,
    rewards: s.rewards,
    points: s.points,
    theme: s.theme.id,
    canTheme: can(viewer, "theme.manage"),
    production: s.install.mode === "production",
    smsReady: smsConfigured(),
  };
}

export async function getAudit({ limit = 200, actorId, action }: { limit?: number; actorId?: number; action?: string } = {}) {
  await requireEmployee("audit.view");
  await io();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (actorId) {
    where.push("a.actor_id = ?");
    params.push(actorId);
  }
  if (action && /^[a-z0-9.]{2,40}$/.test(action)) {
    where.push("a.action LIKE ?");
    params.push(`${action}%`);
  }
  const rows = await q<{
    id: number;
    actor_id: number | null;
    action: string;
    target: string | null;
    detail: string | null;
    ip: string | null;
    ua: string | null;
    seq: number | null;
    created_at: number;
    actor: string | null;
  }>(
    `SELECT a.id, a.actor_id, a.action, a.target, a.detail, a.ip, a.ua, a.seq, a.created_at, COALESCE(u.username, u.name) AS actor
     FROM audit_log a LEFT JOIN employees u ON u.id = a.actor_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
    ...params,
    limit,
  );
  return rows.map((a) => ({ ...a, detail: a.detail ? json.parse<unknown>(a.detail, a.detail) : null }));
}

/** Website bank accounts with balances, and the move history of one of them. */
export async function getBanksPage(selected?: number) {
  const viewer = await requireEmployee("banks.view");
  await io();
  const accounts = await listBankAccounts({ includeArchived: true });
  const current = accounts.find((a) => a.id === selected) ?? accounts.find((a) => a.archivedAt === null) ?? null;
  return {
    accounts,
    current,
    moves: current ? await bankMoves(current.id, 200) : [],
    can: { manage: can(viewer, "banks.manage"), adjust: can(viewer, "banks.adjust") },
  };
}

/** The last result of the hash-chain check (null until the scheduler has run it once). */
export async function getAuditIntegrity() {
  await requireEmployee("audit.view");
  await io();
  return auditIntegrity();
}

export async function getAdminBanners() {
  await requireEmployee("content.manage");
  await io();
  return listBanners();
}

export async function getStaffPage() {
  const viewer = await requireEmployee("staff.manage");
  await io();
  const [staff, roles] = await Promise.all([listStaff(), listRoles()]);
  const logins = await recentStaffSignIns(staff, 60);
  return { viewer: { id: viewer.id, isOwner: viewer.isOwner, permissions: viewer.permissions }, staff, roles, logins };
}

/** The signed-in staff member's own security page (password, two-step sign-in). */
export async function getOwnSecurity() {
  const viewer = await requireEmployeeAllowingPasswordChange();
  await io();
  const [row, site] = await Promise.all([q1<{ totp_enabled: number }>("SELECT totp_enabled FROM employees WHERE id = ?", viewer.id), getSetting("site")]);
  return { viewer, totpEnabled: row?.totp_enabled === 1, totpRequired: site.staffTotpRequired, mustSetUpTotp: await needsTotpSetup(viewer) };
}

/** Like requireEmployee, but lets staff who must change their password reach the page that does it. */
export async function requireEmployeeAllowingPasswordChange() {
  const viewer = await getEmployee();
  if (!viewer) redirect(await loginUrl("/security"));
  return viewer;
}

/** The blocklist page: active entries (optionally one kind or matching a search) and recently lifted ones. */
export async function getBlocklistPage({ kind, search }: { kind?: string; search?: string }) {
  const viewer = await requireEmployee("members.block");
  await io();
  const data = await listBlocks({ kind: isBlockKind(kind) ? kind : undefined, search: search?.slice(0, 60) });
  const view = contactView(viewer);
  // Staff without members.contact see blocked phones and accounts masked, like everywhere else.
  const shown = (b: BlockRow) => ({
    ...b,
    display: b.kind === "phone" ? (view.phone(b.display) ?? "") : b.kind === "bank" ? (view.account(b.display) ?? "") : b.display,
  });
  return { ...data, active: data.active.map(shown), removed: data.removed.map(shown) };
}

/** The activities page: settings, the lotteries guesses can be placed on, and what the activities cost. */
export async function getAdminActivities() {
  const viewer = await requireEmployee("promotions.manage");
  await io();
  const now = Date.now();
  const today = dayStartMs(dayKey(now));
  const week = today - 6 * 86_400_000;
  const [settings, rule, lottos] = await Promise.all([getSetting("activities"), getSetting("points"), listLottos({ includeDisabled: true })]);
  type Sums = { n: number; cost: number | null; paid: number | null };
  const sums = (sql: string, since: number) => tolerateMissingTable(() => q1<Sums>(sql, since), undefined);
  const [wheelToday, wheelWeek, guessToday, guessWeek, wins] = await Promise.all([
    sums("SELECT COUNT(*) AS n, SUM(cost) AS cost, SUM(prize) AS paid FROM wheel_spins WHERE created_at >= ?", today),
    sums("SELECT COUNT(*) AS n, SUM(cost) AS cost, SUM(prize) AS paid FROM wheel_spins WHERE created_at >= ?", week),
    sums("SELECT COUNT(*) AS n, SUM(cost) AS cost, SUM(paid) AS paid FROM point_guesses WHERE created_at >= ?", today),
    sums("SELECT COUNT(*) AS n, SUM(cost) AS cost, SUM(paid) AS paid FROM point_guesses WHERE created_at >= ?", week),
    tolerateMissingTable(
      () =>
        q<{ kind: "wheel" | "guess"; id: number; user_id: number; amount: number; at: number; name: string; phone: string | null }>(
          `(SELECT 'wheel' AS kind, w.id, w.user_id, w.prize AS amount, w.created_at AS at, u.name, u.phone FROM wheel_spins w JOIN users u ON u.id = w.user_id WHERE w.prize > 0 ORDER BY w.id DESC LIMIT 15)
           UNION ALL
           (SELECT 'guess' AS kind, g.id, g.user_id, g.paid AS amount, g.settled_at AS at, u.name, u.phone FROM point_guesses g JOIN users u ON u.id = g.user_id WHERE g.status = 'won' ORDER BY g.id DESC LIMIT 15)
           ORDER BY at DESC LIMIT 20`,
        ),
      [],
    ),
  ]);
  const view = contactView(viewer);
  const stat = (s: Sums | undefined) => ({ n: Number(s?.n ?? 0), cost: Number(s?.cost ?? 0), paid: Number(s?.paid ?? 0) });
  return {
    settings,
    pointRule: rule,
    lottos: lottos.map((l) => ({ id: l.id, name: l.name, format: l.format, enabled: l.enabled })),
    stats: { wheelToday: stat(wheelToday), wheelWeek: stat(wheelWeek), guessToday: stat(guessToday), guessWeek: stat(guessWeek) },
    wins: wins.map((w) => ({ ...w, amount: Number(w.amount), phone: view.phone(w.phone) })),
    ready: wheelToday !== undefined,
  };
}

/** The games page: aggregator connection, products by group, what games took and paid, and shortfalls. */
export async function getAdminGames() {
  const viewer = await requireEmployee("games.manage");
  await io();
  const now = Date.now();
  const today = dayStartMs(dayKey(now));
  const week = today - 6 * 86_400_000;
  type Sum = { grp: string | null; n: number; bets: number | null; paid: number | null };
  const sums = (since: number) =>
    tolerateMissingTable(
      () =>
        q<Sum>(
          `SELECT p.grp, COUNT(*) AS n, SUM(CASE WHEN t.status IN ('REFUND','REJECT','VOID') THEN 0 ELSE t.debited END) AS bets,
                  SUM(CASE WHEN t.status IN ('REFUND','REJECT','VOID') THEN 0 ELSE t.credited END) AS paid
           FROM game_txns t LEFT JOIN game_products p ON p.product_id = t.product_id WHERE t.created_at >= ? GROUP BY p.grp`,
          since,
        ),
      [],
    );
  const [products, dayRows, weekRows, shortfalls] = await Promise.all([
    tolerateMissingTable(
      () =>
        q<{ product_id: string; name: string; grp: string; enabled: number; available: number; games: number; synced_at: number | null }>(
          "SELECT product_id, name, grp, enabled, available, games, synced_at FROM game_products ORDER BY grp, sort, name",
        ),
      null,
    ),
    sums(today),
    sums(week),
    tolerateMissingTable(
      () =>
        q<{
          id: number;
          user_id: number;
          product_id: string;
          txn_id: string;
          action: string;
          shortfall: number;
          created_at: number;
          name: string;
          phone: string | null;
        }>(
          `SELECT m.id, m.user_id, m.product_id, m.txn_id, m.action, m.shortfall, m.created_at, u.name, u.phone
           FROM game_moves m JOIN users u ON u.id = m.user_id WHERE m.shortfall > 0 ORDER BY m.id DESC LIMIT 20`,
        ),
      [],
    ),
  ]);
  const view = contactView(viewer);
  const shape = (rows: Sum[]) => {
    const by = Object.fromEntries(["slot", "casino", "sport", "other"].map((k) => [k, { n: 0, bets: 0, paid: 0 }])) as Record<
      string,
      { n: number; bets: number; paid: number }
    >;
    for (const r of rows) {
      const k = r.grp && by[r.grp] ? r.grp : "other";
      by[k].n += Number(r.n);
      by[k].bets += Number(r.bets ?? 0);
      by[k].paid += Number(r.paid ?? 0);
    }
    return by;
  };
  return {
    ready: products !== null,
    lastSync: products?.reduce<number | null>((m, p) => (p.synced_at && (!m || p.synced_at > m) ? p.synced_at : m), null) ?? null,
    products: (products ?? []).map((p) => ({
      id: p.product_id,
      name: p.name,
      group: p.grp,
      enabled: p.enabled === 1,
      available: p.available === 1,
      games: Number(p.games),
    })),
    today: shape(dayRows),
    week: shape(weekRows),
    shortfalls: shortfalls.map((s) => ({ ...s, shortfall: Number(s.shortfall), phone: view.phone(s.phone) })),
  };
}

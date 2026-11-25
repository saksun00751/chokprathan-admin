"use server";

import { mayAutoResult } from "@/domain/auto-result";
import { FLAG_CODES, isLottoSlug } from "@/domain/new-lotto";
import { parseBkkLocal } from "@/domain/round-input";
import { isBuiltinGroup, isGroupArt, mayMoveGroup } from "@/domain/lotto-groups";
import { createGroup, deleteGroup, listGroups, moveGroup, updateGroup } from "@/server/services/lotto-groups";
import { guessProblem, wheelProblem, type ActivitySettings } from "@/domain/activities";
import { isBlockKind } from "@/domain/blocklist";
import { BANKS } from "@/domain/banks";
import { addBlock, blockMember, removeBlock, type BlockError } from "@/server/services/blocklist";
import type { Dict } from "@/i18n/dictionaries";
import { fmt } from "@/i18n/format";
import { serverI18n } from "@/i18n/server";
import { cleanContentI18n } from "@/server/content-i18n";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { BET_TYPE_ORDER, isBetTypeCode } from "@/domain/betTypes";
import type { ResultInput } from "@/domain/match";
import { pointRuleProblem, pointsAdjustProblem, type PointRule } from "@/domain/points";
import { ADJUST_CEILING, adjustLimitError } from "@/domain/adjust";
import { formatBaht } from "@/domain/money";
import type { Permission } from "@/domain/permissions";
import { validateProfile } from "@/domain/pricing";
import { isThemeId } from "@/domain/themes";
import type { BetTypeCode, ManualLimit, RiskProfile, Schedule } from "@/domain/types";
import type { ActionResult } from "@/lib/action";
import { json, q1, run, tx, tolerateMissingTable, tolerateMissingColumn } from "@/server/db";
import type { BetLimits, RewardSettings, SiteSettings, WalletSettings } from "@/server/catalog";
import { clientInfo } from "@/server/request";
import { InsufficientPointsError, awardPoints, movePoints, pointsNotMigrated } from "@/server/services/points";
import { audit, changes } from "@/server/services/audit";
import { hashPassword, type Employee } from "@/server/services/employee-auth";
import { revokeAllMemberSessions } from "@/server/services/member-sessions";
import { deleteBanner, moveBanner, saveBanner, setBannerImage } from "@/server/services/banners";
import { adjustBankAccount, archiveBankAccount, saveBankAccount, type BankAccountInput, type BankError } from "@/server/services/banks";
import { approveDeposit, approveWithdrawal, rejectDeposit, rejectWithdrawal } from "@/server/services/finance";
import { closeMember, reopenMember, updateMember, type MemberEdit, type MemberEditError } from "@/server/services/members";
import { getLotto, invalidateLottos, listLottos, createLotto } from "@/server/services/lottos";
import { limitLocal } from "@/server/services/ratelimit";
import { setManualLimit } from "@/server/services/risk";
import { cancelRound, reconcileRounds, setResult, createRound } from "@/server/services/rounds";
import { getSetting, getSettings, setSetting } from "@/server/services/settings";
import { createStaff, deleteRole, resetStaffPassword, resetStaffTotp, saveRole, updateStaff } from "@/server/services/employees";
import { InsufficientFundsError, move } from "@/server/services/wallet";
import { saveImage } from "@/server/uploads";
import { invalidate } from "@/server/cache";
import { employeeFor, getEmployee, needsTotpSetup } from "@/server/session";

const done = (message: string): ActionResult => {
  refresh();
  return { ok: true, message };
};

/** The employee when they hold `need` and are not flooding the server; otherwise a refusal. `e` is the messages in the request's language. */
async function gate(need: Permission): Promise<{ viewer: Employee; ip: string | null; e: Dict["errors"] } | { refusal: { ok: false; error: string } }> {
  const [viewer, { t }] = await Promise.all([employeeFor(need), serverI18n()]);
  const e = t.errors;
  if (!viewer) {
    const employee = await getEmployee();
    // Employees who must first set up 2-step sign-in are told so, not that they lack the permission.
    if (employee && !employee.mustChangePassword && (await needsTotpSetup(employee))) return { refusal: { ok: false, error: e.admin.totpRequired } };
    // A signed-in employee trying something they may not do is worth a line in the audit log.
    // Capped per person, so hammering a forbidden action cannot flood the log.
    if (employee && limitLocal(`denied:${employee.id}`, 20, 60_000).ok) await audit(employee.id, "denied", `perm:${need}`).catch(() => {});
    return { refusal: { ok: false, error: fmt(e.generic.denied, { perm: t.admin.shell.perms[need] ?? need }) } };
  }
  if (!limitLocal(`staff:${viewer.id}`, 120, 60_000).ok) return { refusal: { ok: false, error: e.generic.tooFast } };
  return { viewer, ip: (await clientInfo()).ip, e };
}

const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** { site: { phone } } → { "site.phone" }, so edit logs show each changed setting on its own. */
function flat(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

/* ---------- rounds ---------- */

export async function setResultAction(roundId: number, input: ResultInput): Promise<ActionResult> {
  const g = await gate("rounds.result");
  if ("refusal" in g) return g.refusal;
  if (!isId(roundId)) return { ok: false, error: g.e.rounds.notFound };
  const r = await setResult(roundId, input, g.viewer.id);
  return r.ok ? done(g.e.admin.resultSaved) : { ok: false, error: r.error };
}

/** Enter results for many rounds at once (end of the day for stock lotteries). Each round settles on its own. */
export async function setResultsBulkAction(
  items: { roundId: number; input: ResultInput }[],
): Promise<ActionResult<{ saved: number; errors: { roundId: number; error: string }[] }>> {
  const g = await gate("rounds.result");
  if ("refusal" in g) return g.refusal;
  if (!Array.isArray(items) || items.length === 0 || items.length > 60) return { ok: false, error: g.e.admin.pickRounds };
  let saved = 0;
  const errors: { roundId: number; error: string }[] = [];
  for (const item of items) {
    if (!isId(item?.roundId)) continue;
    const r = await setResult(item.roundId, item.input ?? {}, g.viewer.id);
    if (r.ok) saved++;
    else errors.push({ roundId: item.roundId, error: r.error });
  }
  refresh();
  return {
    ok: true,
    message: errors.length ? fmt(g.e.admin.bulkSavedFailed, { n: saved, failed: errors.length }) : fmt(g.e.admin.bulkSaved, { n: saved }),
    data: { saved, errors },
  };
}

export async function cancelRoundAction(roundId: number): Promise<ActionResult> {
  const g = await gate("rounds.cancel");
  if ("refusal" in g) return g.refusal;
  if (!isId(roundId)) return { ok: false, error: g.e.rounds.notFound };
  const r = await cancelRound(roundId, g.viewer.id);
  return r.ok ? done(fmt(g.e.admin.roundCancelled, { n: r.refunded ?? 0 })) : { ok: false, error: r.error ?? g.e.admin.cannotCancel };
}

const createRoundSchema = z.object({ lottoId: z.number().int().positive(), opens: z.string(), closes: z.string(), draw: z.string() });

/** Create one round by hand. Times are Bangkok "YYYY-MM-DDTHH:MM"; an empty draw time uses the lottery's delay. */
export async function createRoundAction(input: unknown): Promise<ActionResult> {
  const g = await gate("lottos.manage");
  if ("refusal" in g) return g.refusal;
  const parsed = createRoundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: g.e.generic.invalid };
  const v = parsed.data;
  const lotto = await getLotto(v.lottoId);
  if (!lotto) return { ok: false, error: g.e.admin.roundCreate.lotto };
  const opensAt = parseBkkLocal(v.opens);
  const closesAt = parseBkkLocal(v.closes);
  const drawAt = v.draw ? parseBkkLocal(v.draw) : closesAt === null ? null : closesAt + lotto.resultDelayMin * 60_000;
  if (opensAt === null || closesAt === null || drawAt === null) return { ok: false, error: g.e.admin.roundCreate.badTime };
  const r = await createRound(v.lottoId, { opensAt, closesAt, drawAt }, g.viewer.id);
  return r.ok ? done(g.e.admin.roundCreate.done) : { ok: false, error: g.e.admin.roundCreate[r.error] };
}

export async function setManualLimitAction(roundId: number, betType: string, number: string, limit: ManualLimit | null): Promise<ActionResult> {
  const g = await gate("risk.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(roundId)) return { ok: false, error: g.e.rounds.notFound };
  if (!isBetTypeCode(betType)) return { ok: false, error: g.e.admin.badBetType };
  if (typeof number !== "string" || !/^\d{1,4}$/.test(number)) return { ok: false, error: g.e.admin.badNumber };
  if (limit !== null && limit?.kind !== "closed" && limit?.kind !== "percent") return { ok: false, error: g.e.admin.badLimit };
  if (limit?.kind === "percent" && (!Number.isInteger(limit.percent) || limit.percent < 1 || limit.percent > 99)) {
    return { ok: false, error: g.e.admin.percentRange };
  }
  await setManualLimit(roundId, betType, number, limit, g.viewer.id);
  return done(
    limit === null
      ? fmt(g.e.admin.limitCleared, { number })
      : limit.kind === "closed"
        ? fmt(g.e.admin.numberClosed, { number })
        : fmt(g.e.admin.numberCut, { number, percent: limit.percent }),
  );
}

/* ---------- global rates, limits, risk ---------- */

const profileSchema = z.object({
  enabled: z.boolean(),
  tiers: z.array(z.object({ threshold: z.number().int().min(1), percent: z.number().int().min(1).max(99) })).max(6),
  cap: z.number().int().min(1).nullable(),
});

export async function saveRiskSettingsAction(input: {
  rates: Record<string, number>;
  limits: BetLimits;
  risk: Record<string, RiskProfile>;
}): Promise<ActionResult> {
  const g = await gate("risk.manage");
  if ("refusal" in g) return g.refusal;
  const settings = await getSettings();
  const errors: string[] = [];
  const rates = { ...settings.rates };
  const risk = { ...settings.risk };
  for (const code of BET_TYPE_ORDER) {
    const rate = Math.round(Number(input?.rates?.[code]));
    if (!Number.isInteger(rate) || rate <= 0 || rate > 10_000_000) errors.push(fmt(g.e.admin.badRate, { code }));
    else rates[code] = rate;
    const parsed = profileSchema.safeParse(input?.risk?.[code]);
    if (!parsed.success) {
      errors.push(fmt(g.e.admin.badTier, { code }));
      continue;
    }
    const problems = validateProfile(parsed.data, g.e.risk);
    if (problems.length) errors.push(...problems.map((p) => `${code}: ${p}`));
    else risk[code] = parsed.data;
  }
  const l = input?.limits;
  if (
    !l ||
    !Number.isInteger(l.minStake) ||
    l.minStake < 1 ||
    !Number.isInteger(l.maxPerBill) ||
    l.maxPerBill < l.minStake ||
    !Number.isInteger(l.maxLines) ||
    l.maxLines < 1 ||
    l.maxLines > 500
  ) {
    errors.push(g.e.admin.badLimits);
  }
  if (errors.length) return { ok: false, error: errors.slice(0, 3).join(" · ") };
  const maxPerNumber = Object.fromEntries(BET_TYPE_ORDER.map((c) => [c, Math.max(l.minStake, Math.round(Number(l.maxPerNumber?.[c]) || 0))])) as Record<
    BetTypeCode,
    number
  >;
  const limits = { minStake: l.minStake, maxPerBill: l.maxPerBill, maxLines: l.maxLines, maxPerNumber };
  await tx(async () => {
    await setSetting("rates", rates);
    await setSetting("risk", risk);
    await setSetting("limits", limits);
    await audit(g.viewer.id, "settings.risk", "global", { rates, risk, limits }, Date.now(), g.ip);
  });
  return done(g.e.admin.ratesSaved);
}

/* ---------- lotto types ---------- */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const scheduleSchema = z
  .union([
    z.object({ kind: z.literal("weekly"), days: z.array(z.number().int().min(0).max(6)).min(1).max(7), close: hhmm, opens: hhmm.optional() }),
    z.object({ kind: z.literal("monthly"), days: z.array(z.number().int().min(1).max(31)).min(1).max(31), close: hhmm, opens: hhmm.optional() }),
    z.object({ kind: z.literal("interval"), firstClose: hhmm, everyMin: z.number().int().min(5).max(720), count: z.number().int().min(1).max(288), opens: hhmm.optional() }),
  ])
  // An own opening time is on the round's day, so it must come before the (first) close; "HH:MM" compares as text.
  .refine((s) => !s.opens || s.opens < (s.kind === "interval" ? s.firstClose : s.close));

const lottoSchema = z.object({
  name: z.string().trim().min(2).max(60),
  shortName: z.string().trim().min(1).max(30),
  group: z.string().min(1).max(40),
  enabled: z.boolean(),
  autoResult: z.boolean(),
  autoRounds: z.boolean(),
  resultDelayMin: z.number().int().min(0).max(1440),
  schedule: scheduleSchema,
  rates: z.record(z.string(), z.number().int().positive().max(10_000_000)),
  risk: z.record(z.string(), profileSchema),
});

export async function saveLottoAction(lottoId: number, input: unknown): Promise<ActionResult> {
  const g = await gate("lottos.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(lottoId)) return { ok: false, error: g.e.admin.lottoNotFound };
  const parsed = lottoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: g.e.generic.invalid };
  const v = parsed.data;
  for (const code of Object.keys(v.rates)) if (!isBetTypeCode(code)) return { ok: false, error: g.e.admin.badBetType };
  for (const [code, p] of Object.entries(v.risk)) {
    if (!isBetTypeCode(code)) return { ok: false, error: g.e.admin.badBetType };
    const problems = validateProfile(p, g.e.risk);
    if (problems.length) return { ok: false, error: `${code}: ${problems[0]}` };
  }
  const before = await getLotto(lottoId);
  if (!(await listGroups()).some((x) => x.code === v.group)) return { ok: false, error: g.e.admin.groupNotFound };
  if (before && !mayMoveGroup(before.group, v.group)) return { ok: false, error: g.e.admin.groupLocked };
  if (v.autoResult && !mayAutoResult(v.group)) return { ok: false, error: g.e.admin.autoResultNotAllowed };
  // Written on its own, and only when switched: the column arrives with member migration 11, and
  // saving anything else must keep working before it does.
  const switched = before !== undefined && before.autoRounds !== v.autoRounds;
  if (switched) {
    const stored = await tolerateMissingColumn(() => run("UPDATE lottos SET auto_rounds = ? WHERE id = ?", v.autoRounds ? 1 : 0, lottoId), null);
    if (stored === null) return { ok: false, error: g.e.admin.autoRoundsNeedsMigration };
  }
  const changed = (
    await run(
      `UPDATE lottos SET name = ?, short_name = ?, grp = ?, enabled = ?, auto_result = ?, result_delay_min = ?, schedule = ?, rates = ?, risk = ?, updated_at = ? WHERE id = ?`,
      v.name,
      v.shortName,
      v.group,
      v.enabled ? 1 : 0,
      v.autoResult ? 1 : 0,
      v.resultDelayMin,
      json.str(v.schedule as Schedule),
      json.str(v.rates),
      json.str(v.risk),
      Date.now(),
      lottoId,
    )
  ).changes;
  if (!changed) return { ok: false, error: g.e.admin.lottoNotFound };
  invalidateLottos();
  await audit(g.viewer.id, "lotto.update", `lotto:${lottoId}`, v, Date.now(), g.ip);
  // A new schedule or draw delay must reach rounds already created (only those without bills or guesses).
  if (!before || switched || json.str(before.schedule) !== json.str(v.schedule) || before.resultDelayMin !== v.resultDelayMin) {
    await reconcileRounds(lottoId, g.viewer.id).catch((error) => console.error("[lottos] round reconcile failed:", error instanceof Error ? error.message : error));
  }
  return done(fmt(g.e.admin.lottoSaved, { name: v.shortName }));
}

const newLottoSchema = lottoSchema.pick({ name: true, shortName: true, group: true, schedule: true, resultDelayMin: true }).extend({
  slug: z.string().refine(isLottoSlug),
  format: z.enum(["standard", "thai_gov", "laos4"]),
  flag: z.enum(FLAG_CODES).nullable(),
});

export async function createLottoAction(input: unknown): Promise<ActionResult> {
  const g = await gate("lottos.manage");
  if ("refusal" in g) return g.refusal;
  const parsed = newLottoSchema.safeParse(input);
  if (!parsed.success) {
    const slug = parsed.error.issues.some((i) => i.path[0] === "slug");
    return { ok: false, error: slug ? g.e.admin.lottoBadSlug : g.e.generic.invalid };
  }
  const v = parsed.data;
  if (!(await listGroups()).some((x) => x.code === v.group)) return { ok: false, error: g.e.admin.groupNotFound };
  // Yiki is the house game; no other lottery may join it.
  if (!mayMoveGroup(v.group, "")) return { ok: false, error: g.e.admin.groupLocked };
  const id = await createLotto({ ...v, schedule: v.schedule as Schedule });
  if (id === null) return { ok: false, error: g.e.admin.lottoSlugTaken };
  await audit(g.viewer.id, "lotto.create", `lotto:${id}`, v, Date.now(), g.ip);
  return done(fmt(g.e.admin.lottoCreated, { name: v.shortName }));
}

/* ---------- lotto groups ---------- */

const groupSchema = z.object({ name: z.string().trim().max(60), art: z.string().refine(isGroupArt), i18n: z.unknown() });

/** Create (`code` null) or edit a group. A built-in may keep an empty name, which shows the standard label. */
export async function saveLottoGroupAction(code: string | null, input: unknown): Promise<ActionResult> {
  const g = await gate("lottos.manage");
  if ("refusal" in g) return g.refusal;
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: g.e.generic.invalid };
  const { name, art } = parsed.data;
  if (!name && !(code !== null && isBuiltinGroup(code))) return { ok: false, error: g.e.admin.groupNameRequired };
  const values = { name, art, i18n: cleanContentI18n(parsed.data.i18n, { name: 60 }) };
  // null means the table is not there yet (member migration 10).
  const saved = await tolerateMissingTable<string | false | null>(
    async () => (code === null ? createGroup(values) : (await updateGroup(code, values)) && code),
    null,
  );
  if (saved === null) return { ok: false, error: g.e.admin.groupNeedsMigration };
  if (saved === false) return { ok: false, error: g.e.admin.groupNotFound };
  invalidateLottos();
  await audit(g.viewer.id, code === null ? "lotto.group.create" : "lotto.group.update", `lotto-group:${saved}`, values, Date.now(), g.ip);
  return done(g.e.admin.groupSaved);
}

export async function deleteLottoGroupAction(code: string): Promise<ActionResult> {
  const g = await gate("lottos.manage");
  if ("refusal" in g) return g.refusal;
  if (typeof code !== "string") return { ok: false, error: g.e.admin.groupNotFound };
  const result = await tolerateMissingTable<Awaited<ReturnType<typeof deleteGroup>> | null>(() => deleteGroup(code), null);
  if (result !== "ok") {
    const errors = { builtin: g.e.admin.groupBuiltin, used: g.e.admin.groupUsed, missing: g.e.admin.groupNotFound };
    return { ok: false, error: result === null ? g.e.admin.groupNeedsMigration : errors[result] };
  }
  invalidateLottos();
  await audit(g.viewer.id, "lotto.group.delete", `lotto-group:${code}`, undefined, Date.now(), g.ip);
  return done(g.e.admin.groupDeleted);
}

export async function moveLottoGroupAction(code: string, step: number): Promise<ActionResult> {
  const g = await gate("lottos.manage");
  if ("refusal" in g) return g.refusal;
  if (typeof code !== "string" || (step !== -1 && step !== 1)) return { ok: false, error: g.e.generic.invalid };
  const moved = await tolerateMissingTable<boolean | null>(() => moveGroup(code, step), null);
  if (moved === null) return { ok: false, error: g.e.admin.groupNeedsMigration };
  if (!moved) return { ok: false, error: g.e.generic.invalid };
  invalidateLottos();
  await audit(g.viewer.id, "lotto.group.move", `lotto-group:${code}`, { step }, Date.now(), g.ip);
  return done(g.e.admin.groupSaved);
}

/* ---------- members ---------- */

export async function adjustBalanceAction(userId: number, amountBaht: number, note: string): Promise<ActionResult> {
  const g = await gate("members.adjust");
  if ("refusal" in g) return g.refusal;
  if (!isId(userId)) return { ok: false, error: g.e.admin.memberNotFound };
  const amount = Math.round(Number(amountBaht) * 100);
  if (!Number.isInteger(amount)) return { ok: false, error: g.e.admin.adjustAmount };
  const { wallet } = await getSettings();
  const limit = adjustLimitError(amount, wallet);
  if (limit === "zero") return { ok: false, error: g.e.admin.adjustAmount };
  if (limit) return { ok: false, error: fmt(g.e.admin.adjustLimit, { min: formatBaht(wallet.adjustMin), max: formatBaht(wallet.adjustMax) }) };
  const reason = String(note ?? "")
    .trim()
    .slice(0, 120);
  if (reason.length < 3) return { ok: false, error: g.e.admin.adjustReason };
  const target = await q1<{ role: string; status: string }>("SELECT role, status FROM users WHERE id = ?", userId);
  if (target?.role !== "member") return { ok: false, error: g.e.admin.adjustMemberOnly };
  if (target.status === "closed") return { ok: false, error: g.e.admin.memberAlreadyClosed };
  let earned = 0;
  try {
    await tx(async () => {
      await move(userId, "balance", amount, "adjust", { note: reason, actorId: g.viewer.id });
      // Credit added through the back office earns points like a deposit (a deduction takes none back).
      if (amount > 0) earned = await awardPoints(userId, amount, "topup", { note: reason, actorId: g.viewer.id });
      await audit(g.viewer.id, "member.adjust", `user:${userId}`, { amount, note: reason, points: earned }, Date.now(), g.ip);
    });
  } catch (e) {
    if (e instanceof InsufficientFundsError) return { ok: false, error: g.e.admin.adjustInsufficient };
    throw e;
  }
  const message = fmt(g.e.admin.adjusted, { amount: `${amount > 0 ? "+" : ""}${formatBaht(amount)}` });
  return done(earned > 0 ? `${message} ${fmt(g.e.admin.pointsEarned, { n: earned.toLocaleString("en-US") })}` : message);
}

/** Add or deduct a member's points by hand. Needs members.points and a reason; never below zero. */
export async function adjustPointsAction(userId: number, delta: number, note: string): Promise<ActionResult> {
  const g = await gate("members.points");
  if ("refusal" in g) return g.refusal;
  if (!isId(userId)) return { ok: false, error: g.e.admin.memberNotFound };
  const amount = Number(delta);
  const problem = pointsAdjustProblem(amount);
  if (problem) return { ok: false, error: g.e.admin.pointsAmount };
  const reason = String(note ?? "")
    .trim()
    .slice(0, 120);
  if (reason.length < 3) return { ok: false, error: g.e.admin.adjustReason };
  const target = await q1<{ role: string; status: string }>("SELECT role, status FROM users WHERE id = ?", userId);
  if (target?.role !== "member") return { ok: false, error: g.e.admin.adjustMemberOnly };
  if (target.status === "closed") return { ok: false, error: g.e.admin.memberAlreadyClosed };
  let balance = 0;
  try {
    await tx(async () => {
      balance = await movePoints(userId, amount, "adjust", { note: reason, actorId: g.viewer.id });
      await audit(g.viewer.id, "member.points", `user:${userId}`, { points: amount, balance, note: reason }, Date.now(), g.ip);
    });
  } catch (e) {
    if (e instanceof InsufficientPointsError) return { ok: false, error: g.e.admin.pointsInsufficient };
    if (pointsNotMigrated(e)) return { ok: false, error: g.e.admin.pointsNotReady };
    throw e;
  }
  return done(fmt(g.e.admin.pointsAdjusted, { n: `${amount > 0 ? "+" : ""}${amount.toLocaleString("en-US")}`, balance: balance.toLocaleString("en-US") }));
}

export async function setMemberStatusAction(userId: number, status: "active" | "suspended"): Promise<ActionResult> {
  const g = await gate("members.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(userId) || (status !== "active" && status !== "suspended")) return { ok: false, error: g.e.generic.invalid };
  // A closed account only reopens through reopenMemberAction (members.delete), never through suspend/activate.
  const changed = (await run("UPDATE users SET status = ? WHERE id = ? AND role = 'member' AND status <> 'closed'", status, userId)).changes;
  if (!changed) return { ok: false, error: g.e.admin.memberNotFound };
  if (status === "suspended") await revokeAllMemberSessions(userId);
  await audit(g.viewer.id, "member.status", `user:${userId}`, { status }, Date.now(), g.ip);
  return done(status === "suspended" ? g.e.admin.suspended : g.e.admin.activated);
}

export async function resetMemberPasswordAction(userId: number, password: string): Promise<ActionResult> {
  const g = await gate("members.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(userId)) return { ok: false, error: g.e.admin.memberNotFound };
  if (typeof password !== "string" || password.length < 8 || password.length > 64) return { ok: false, error: g.e.admin.passwordShort };
  const changed = (await run("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'member'", await hashPassword(password), userId)).changes;
  if (!changed) return { ok: false, error: g.e.admin.memberNotFound };
  await revokeAllMemberSessions(userId);
  await audit(g.viewer.id, "member.password", `user:${userId}`, undefined, Date.now(), g.ip);
  return done(g.e.admin.passwordReset);
}

export async function saveMemberNoteAction(userId: number, note: string): Promise<ActionResult> {
  const g = await gate("members.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(userId)) return { ok: false, error: g.e.admin.memberNotFound };
  await run(
    "UPDATE users SET staff_note = ? WHERE id = ? AND role = 'member'",
    String(note ?? "")
      .trim()
      .slice(0, 255) || null,
    userId,
  );
  await audit(g.viewer.id, "member.note", `user:${userId}`, undefined, Date.now(), g.ip);
  return done(g.e.admin.noteSaved);
}

const reasonOf = (v: unknown) =>
  String(v ?? "")
    .trim()
    .slice(0, 200);

export async function updateMemberAction(userId: number, input: MemberEdit, reason: string): Promise<ActionResult> {
  const g = await gate("members.edit");
  if ("refusal" in g) return g.refusal;
  if (!isId(userId)) return { ok: false, error: g.e.admin.memberNotFound };
  const why = reasonOf(reason);
  if (why.length < 3) return { ok: false, error: g.e.admin.reasonRequired };
  const r = await updateMember(userId, input ?? {}, why, { id: g.viewer.id, ip: g.ip });
  if (r.ok) return done(g.e.admin.memberUpdated);
  const m: Record<MemberEditError, string> = {
    notFound: g.e.admin.memberNotFound,
    nothing: g.e.admin.memberNothingChanged,
    name: g.e.auth.nameRequired,
    phone: g.e.auth.phoneFormat,
    bank: g.e.admin.bankInvalid,
    account: g.e.auth.accountDigits,
    accountName: g.e.auth.accountName,
    phoneTaken: g.e.admin.memberPhoneTaken,
    bankTaken: g.e.admin.memberBankTaken,
    blocked: g.e.admin.memberBlockedValue,
  };
  return { ok: false, error: m[r.error] };
}

export async function closeMemberAction(userId: number, reason: string): Promise<ActionResult> {
  const g = await gate("members.delete");
  if ("refusal" in g) return g.refusal;
  if (!isId(userId)) return { ok: false, error: g.e.admin.memberNotFound };
  const why = reasonOf(reason);
  if (why.length < 3) return { ok: false, error: g.e.admin.reasonRequired };
  const r = await closeMember(userId, why, { id: g.viewer.id, ip: g.ip });
  if (r.ok) return done(g.e.admin.memberClosed);
  if ("blockers" in r) {
    const { t } = await serverI18n();
    return { ok: false, error: fmt(g.e.admin.memberCloseBlocked, { list: r.blockers.map((b) => t.admin.content.member.blockers[b]).join(", ") }) };
  }
  return { ok: false, error: r.error === "already" ? g.e.admin.memberAlreadyClosed : g.e.admin.memberNotFound };
}

export async function reopenMemberAction(userId: number, reason: string): Promise<ActionResult> {
  const g = await gate("members.delete");
  if ("refusal" in g) return g.refusal;
  if (!isId(userId)) return { ok: false, error: g.e.admin.memberNotFound };
  const why = reasonOf(reason);
  if (why.length < 3) return { ok: false, error: g.e.admin.reasonRequired };
  const r = await reopenMember(userId, why, { id: g.viewer.id, ip: g.ip });
  return r.ok ? done(g.e.admin.memberReopened) : { ok: false, error: g.e.admin.memberNotClosed };
}

/* ---------- website bank accounts ---------- */

const bankMessage = (e: Dict["errors"], error: BankError) =>
  ({
    notFound: e.admin.bankNotFound,
    invalid: e.admin.bankInvalid,
    duplicate: e.admin.bankDuplicate,
    balance: e.admin.bankArchiveBalance,
    open: e.admin.bankArchiveOpen,
    amount: e.admin.bankAmount,
  })[error];

export async function saveBankAccountAction(id: number | null, input: BankAccountInput): Promise<ActionResult> {
  const g = await gate("banks.manage");
  if ("refusal" in g) return g.refusal;
  if (id !== null && !isId(id)) return { ok: false, error: g.e.admin.bankNotFound };
  const r = await saveBankAccount(id, input, { id: g.viewer.id, ip: g.ip });
  return r.ok ? done(g.e.admin.bankSaved) : { ok: false, error: bankMessage(g.e, r.error) };
}

export async function archiveBankAccountAction(id: number): Promise<ActionResult> {
  const g = await gate("banks.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.admin.bankNotFound };
  const r = await archiveBankAccount(id, { id: g.viewer.id, ip: g.ip });
  return r.ok ? done(g.e.admin.bankArchived) : { ok: false, error: bankMessage(g.e, r.error) };
}

export async function adjustBankAccountAction(id: number, amountBaht: number, reason: string): Promise<ActionResult> {
  const g = await gate("banks.adjust");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.admin.bankNotFound };
  const why = reasonOf(reason);
  if (why.length < 3) return { ok: false, error: g.e.admin.reasonRequired };
  const amount = Math.round(Number(amountBaht) * 100);
  const r = await adjustBankAccount(id, amount, why, { id: g.viewer.id, ip: g.ip });
  return r.ok
    ? done(fmt(g.e.admin.bankAdjusted, { amount: `${amount > 0 ? "+" : ""}${formatBaht(amount)}` }))
    : { ok: false, error: bankMessage(g.e, r.error) };
}

/* ---------- finance ---------- */

export async function reviewDepositAction(id: number, approve: boolean, note = ""): Promise<ActionResult> {
  const g = await gate("finance.deposit");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.admin.itemNotFound };
  const r = approve ? await approveDeposit(id, g.viewer.id, Date.now(), g.ip) : await rejectDeposit(id, g.viewer.id, String(note ?? ""), Date.now(), g.ip);
  return r.ok ? done(approve ? g.e.admin.depositApproved : g.e.admin.depositRejected) : { ok: false, error: r.error };
}

export async function reviewWithdrawalAction(id: number, approve: boolean, note = "", paidFromId: number | null = null): Promise<ActionResult> {
  const g = await gate("finance.withdraw");
  if ("refusal" in g) return g.refusal;
  if (!isId(id) || (paidFromId !== null && !isId(paidFromId))) return { ok: false, error: g.e.admin.itemNotFound };
  const r = approve
    ? await approveWithdrawal(id, g.viewer.id, Date.now(), g.ip, paidFromId)
    : await rejectWithdrawal(id, g.viewer.id, String(note ?? ""), Date.now(), g.ip);
  return r.ok ? done(approve ? g.e.admin.withdrawPaid : g.e.admin.withdrawRejected) : { ok: false, error: r.error };
}

/* ---------- promotions, vouchers, news ---------- */

const promoSchema = z.object({
  title: z.string().trim().min(2).max(80),
  summary: z.string().trim().min(2).max(200),
  details: z.string().trim().max(500),
  bonusPercent: z.number().int().min(0).max(200),
  maxBonus: z.number().min(0).max(1_000_000),
  minDeposit: z.number().min(0).max(1_000_000),
  turnoverX: z.number().int().min(0).max(50),
  oncePerUser: z.boolean(),
  active: z.boolean(),
  i18n: z.unknown().optional(),
});

const contentChanged = () => invalidate("content:");

export async function savePromotionAction(id: number | null, input: unknown): Promise<ActionResult> {
  const g = await gate("promotions.manage");
  if ("refusal" in g) return g.refusal;
  const p = promoSchema.safeParse(input);
  if (!p.success) return { ok: false, error: g.e.generic.invalid };
  const v = p.data;
  const translations = json.str(cleanContentI18n(v.i18n, { title: 80, summary: 200, details: 500 }));
  const values = [
    v.title,
    v.summary,
    v.details,
    v.bonusPercent,
    Math.round(v.maxBonus * 100),
    Math.round(v.minDeposit * 100),
    v.turnoverX,
    v.oncePerUser ? 1 : 0,
    v.active ? 1 : 0,
    translations,
  ] as const;
  if (id === null) {
    await run(
      "INSERT INTO promotions (title, summary, details, bonus_percent, max_bonus, min_deposit, turnover_x, once_per_user, active, i18n, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 99, ?)",
      ...values,
      Date.now(),
    );
  } else {
    if (!isId(id)) return { ok: false, error: g.e.admin.promoNotFound };
    await run(
      "UPDATE promotions SET title = ?, summary = ?, details = ?, bonus_percent = ?, max_bonus = ?, min_deposit = ?, turnover_x = ?, once_per_user = ?, active = ?, i18n = ? WHERE id = ?",
      ...values,
      id,
    );
  }
  contentChanged();
  await audit(g.viewer.id, id === null ? "promotion.create" : "promotion.update", id === null ? null : `promotion:${id}`, v, Date.now(), g.ip);
  return done(g.e.admin.promoSaved);
}

export async function createVoucherAction(input: { code: string; value: number; maxUses: number; days: number; note: string }): Promise<ActionResult> {
  const g = await gate("promotions.manage");
  if ("refusal" in g) return g.refusal;
  const code = String(input?.code ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(code)) return { ok: false, error: g.e.admin.voucherCode };
  if (await q1("SELECT 1 FROM vouchers WHERE code = ?", code)) return { ok: false, error: g.e.admin.voucherTaken };
  const value = Math.round(Number(input.value) * 100);
  const maxUses = Math.round(Number(input.maxUses));
  if (!(value > 0) || value > 100_000_00 || !(maxUses > 0) || maxUses > 1_000_000) return { ok: false, error: g.e.admin.voucherValue };
  const days = Math.round(Number(input.days));
  await run(
    "INSERT INTO vouchers (code, value, max_uses, expires_at, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    code,
    value,
    maxUses,
    days > 0 ? Date.now() + Math.min(days, 3650) * 86_400_000 : null,
    String(input.note ?? "").slice(0, 80) || null,
    g.viewer.id,
    Date.now(),
  );
  await audit(g.viewer.id, "voucher.create", `voucher:${code}`, { value, maxUses, days }, Date.now(), g.ip);
  return done(fmt(g.e.admin.voucherCreated, { code }));
}

export async function toggleVoucherAction(id: number, active: boolean): Promise<ActionResult> {
  const g = await gate("promotions.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.admin.voucherNotFound };
  await run("UPDATE vouchers SET active = ? WHERE id = ?", active ? 1 : 0, id);
  await audit(g.viewer.id, "voucher.toggle", `voucher:${id}`, { active }, Date.now(), g.ip);
  return done(active ? g.e.admin.voucherOn : g.e.admin.voucherOff);
}

export async function saveNewsAction(
  id: number | null,
  input: { title: string; body: string; pinned: boolean; published: boolean; i18n?: unknown },
): Promise<ActionResult> {
  const g = await gate("content.manage");
  if ("refusal" in g) return g.refusal;
  const title = String(input?.title ?? "")
    .trim()
    .slice(0, 120);
  const body = String(input?.body ?? "")
    .trim()
    .slice(0, 5000);
  if (title.length < 2 || body.length < 2) return { ok: false, error: g.e.admin.newsRequired };
  const translations = json.str(cleanContentI18n(input.i18n, { title: 120, body: 5000 }));
  if (id === null) {
    await run(
      "INSERT INTO news (title, body, pinned, published, i18n, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      title,
      body,
      input.pinned ? 1 : 0,
      input.published ? 1 : 0,
      translations,
      Date.now(),
    );
  } else {
    if (!isId(id)) return { ok: false, error: g.e.admin.newsNotFound };
    await run(
      "UPDATE news SET title = ?, body = ?, pinned = ?, published = ?, i18n = ? WHERE id = ?",
      title,
      body,
      input.pinned ? 1 : 0,
      input.published ? 1 : 0,
      translations,
      id,
    );
  }
  contentChanged();
  await audit(g.viewer.id, id === null ? "news.create" : "news.update", id === null ? null : `news:${id}`, { title }, Date.now(), g.ip);
  return done(g.e.admin.newsSaved);
}

export async function deleteNewsAction(id: number): Promise<ActionResult> {
  const g = await gate("content.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.admin.newsNotFound };
  await run("DELETE FROM news WHERE id = ?", id);
  contentChanged();
  await audit(g.viewer.id, "news.delete", `news:${id}`, undefined, Date.now(), g.ip);
  return done(g.e.admin.newsDeleted);
}

/* ---------- site settings and theme ---------- */

export async function saveSettingsAction(input: {
  site: SiteSettings;
  wallet: WalletSettings;
  rewards: RewardSettings;
  points: PointRule;
}): Promise<ActionResult> {
  const g = await gate("settings.manage");
  if ("refusal" in g) return g.refusal;
  const { site, wallet, rewards, points } = input ?? ({} as typeof input);
  if (!site || !wallet || !rewards || !points) return { ok: false, error: g.e.generic.incomplete };
  const nextPoints: PointRule = { enabled: !!points.enabled, every: Number(points.every), points: Number(points.points) };
  if (pointRuleProblem(nextPoints)) return { ok: false, error: g.e.admin.settingsPoints };
  const ints = [
    wallet.depositMin,
    wallet.depositMax,
    wallet.withdrawMin,
    wallet.withdrawMax,
    wallet.withdrawPerDay,
    wallet.depositWindowMin,
    wallet.adjustMin,
    wallet.adjustMax,
    rewards.cashbackBp,
    rewards.aff1Bp,
    rewards.aff2Bp,
    site.cancelWindowMin,
  ];
  if (ints.some((n) => !Number.isInteger(n) || n < 0)) return { ok: false, error: g.e.admin.settingsInts };
  if (wallet.depositMin > wallet.depositMax || wallet.withdrawMin > wallet.withdrawMax) return { ok: false, error: g.e.admin.settingsMinMax };
  if (wallet.depositWindowMin < 5 || wallet.depositWindowMin > 180) return { ok: false, error: g.e.admin.settingsWindow };
  if (site.cancelWindowMin > 120) return { ok: false, error: g.e.admin.settingsCancel };
  if (rewards.cashbackBp > 5000 || rewards.aff1Bp > 1000 || rewards.aff2Bp > 1000) return { ok: false, error: g.e.admin.settingsPercent };
  if (wallet.adjustMin < 1_00 || wallet.adjustMin > wallet.adjustMax || wallet.adjustMax > ADJUST_CEILING)
    return { ok: false, error: g.e.admin.settingsAdjust };
  const current = await getSettings();
  const nextSite: SiteSettings = {
    ...current.site,
    demoMode: !!site.demoMode,
    simulateCrowd: !!site.simulateCrowd,
    otpRequired: !!site.otpRequired,
    registrationOpen: !!site.registrationOpen,
    lineId: String(site.lineId ?? "").slice(0, 40),
    phone: String(site.phone ?? "").slice(0, 30),
    announcement: String(site.announcement ?? "").slice(0, 200),
    announcementI18n: Object.fromEntries(
      Object.entries(cleanContentI18n(Object.fromEntries(Object.entries(site.announcementI18n ?? {}).map(([l, text]) => [l, { text }])), { text: 200 })).map(
        ([l, v]) => [l, v?.text ?? ""],
      ),
    ) as SiteSettings["announcementI18n"],
    cancelWindowMin: site.cancelWindowMin,
    staffTotpRequired: !!site.staffTotpRequired,
  };
  if (current.install.mode === "production" && (nextSite.demoMode || nextSite.simulateCrowd)) {
    return { ok: false, error: g.e.admin.settingsProduction };
  }
  // Requiring 2-step for everyone while lacking it yourself would shut you out of this very page.
  if (nextSite.staffTotpRequired && !current.site.staffTotpRequired && !g.viewer.totpEnabled) {
    return { ok: false, error: g.e.admin.totpSelfFirst };
  }
  const nextWallet: WalletSettings = {
    ...current.wallet,
    depositMin: wallet.depositMin,
    depositMax: wallet.depositMax,
    withdrawMin: wallet.withdrawMin,
    withdrawMax: wallet.withdrawMax,
    withdrawPerDay: wallet.withdrawPerDay,
    depositWindowMin: wallet.depositWindowMin,
    depositAutoApprove: current.install.mode === "production" ? false : !!wallet.depositAutoApprove,
    slipRequired: !!wallet.slipRequired,
    adjustMin: wallet.adjustMin,
    adjustMax: wallet.adjustMax,
  };
  const nextRewards: RewardSettings = { cashbackBp: rewards.cashbackBp, aff1Bp: rewards.aff1Bp, aff2Bp: rewards.aff2Bp };
  await tx(async () => {
    await setSetting("site", nextSite);
    await setSetting("wallet", nextWallet);
    await setSetting("rewards", nextRewards);
    await setSetting("points", nextPoints);
    await audit(
      g.viewer.id,
      "settings.site",
      "site",
      changes(
        flat({ site: current.site, wallet: current.wallet, rewards: current.rewards, points: current.points }),
        flat({ site: nextSite, wallet: nextWallet, rewards: nextRewards, points: nextPoints }),
      ),
      Date.now(),
      g.ip,
    );
  });
  return done(g.e.admin.settingsSaved);
}

export async function saveThemeAction(themeId: string): Promise<ActionResult> {
  const g = await gate("theme.manage");
  if ("refusal" in g) return g.refusal;
  if (!isThemeId(themeId)) return { ok: false, error: g.e.admin.themeNotFound };
  await setSetting("theme", { id: themeId });
  await audit(g.viewer.id, "settings.theme", "theme", { id: themeId }, Date.now(), g.ip);
  updateTag("theme");
  return done(g.e.admin.themeSaved);
}

/* ---------- home slider banners ---------- */

export async function saveBannerAction(id: number | null, formData: FormData): Promise<ActionResult> {
  const g = await gate("content.manage");
  if ("refusal" in g) return g.refusal;
  if (id !== null && !isId(id)) return { ok: false, error: g.e.banners.notFound };
  const text = (k: string) => String(formData.get(k) ?? "");
  const r = await saveBanner(
    id,
    {
      tag: text("tag"),
      title: text("title"),
      subtitle: text("subtitle"),
      ctaLabel: text("ctaLabel"),
      ctaHref: text("ctaHref"),
      art: text("art"),
      tone: text("tone"),
      showText: formData.get("showText") === "on",
      active: formData.get("active") === "on",
      i18n: (() => {
        try {
          return JSON.parse(text("i18n") || "{}");
        } catch {
          return {};
        }
      })(),
    },
    g.viewer.id,
  );
  if (!r.ok) return { ok: false, error: r.error };
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const saved = await saveImage(new Uint8Array(await file.arrayBuffer()), `banner-${r.id}`, { kind: "banner", ownerId: g.viewer.id });
    if (!saved.ok) return { ok: false, error: fmt(g.e.admin.bannerImageFailed, { error: saved.error }) };
    await setBannerImage(r.id, saved.name, g.viewer.id);
  } else if (formData.get("removeImage") === "on") {
    await setBannerImage(r.id, null, g.viewer.id);
  }
  return done(id === null ? g.e.admin.bannerAdded : g.e.admin.bannerSaved);
}

export async function moveBannerAction(id: number, dir: -1 | 1): Promise<ActionResult> {
  const g = await gate("content.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.banners.notFound };
  await moveBanner(id, dir === -1 ? -1 : 1, g.viewer.id);
  return done(g.e.admin.bannerMoved);
}

export async function deleteBannerAction(id: number): Promise<ActionResult> {
  const g = await gate("content.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.banners.notFound };
  await deleteBanner(id, g.viewer.id);
  return done(g.e.admin.bannerDeleted);
}

/* ---------- staff and roles ---------- */

export async function createStaffAction(input: { username: string; name: string; password: string; roleId: number }): Promise<ActionResult> {
  const g = await gate("staff.manage");
  if ("refusal" in g) return g.refusal;
  const r = await createStaff(
    { username: String(input?.username ?? ""), name: String(input?.name ?? ""), password: String(input?.password ?? ""), roleId: Number(input?.roleId) },
    g.viewer,
  );
  return r.ok ? done(g.e.admin.staffAdded) : { ok: false, error: r.error };
}

export async function updateStaffAction(id: number, input: { name: string; roleId: number; status: "active" | "suspended" }): Promise<ActionResult> {
  const g = await gate("staff.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(id) || !isId(input?.roleId) || (input.status !== "active" && input.status !== "suspended")) return { ok: false, error: g.e.generic.invalid };
  const r = await updateStaff(id, { name: String(input.name ?? ""), roleId: input.roleId, status: input.status }, g.viewer);
  return r.ok ? done(g.e.admin.staffSaved) : { ok: false, error: r.error };
}

export async function resetStaffPasswordAction(id: number, password: string): Promise<ActionResult> {
  const g = await gate("staff.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.admin.staffNotFound };
  const r = await resetStaffPassword(id, String(password ?? ""), g.viewer);
  return r.ok ? done(g.e.admin.staffPasswordReset) : { ok: false, error: r.error };
}

export async function resetStaffTotpAction(id: number): Promise<ActionResult> {
  const g = await gate("staff.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.admin.staffNotFound };
  const r = await resetStaffTotp(id, g.viewer);
  return r.ok ? done(g.e.admin.staffTotpReset) : { ok: false, error: r.error };
}

export async function saveRoleAction(id: number | null, input: { name: string; description: string; permissions: string[] }): Promise<ActionResult> {
  const g = await gate("staff.manage");
  if ("refusal" in g) return g.refusal;
  if (id !== null && !isId(id)) return { ok: false, error: g.e.admin.roleNotFound };
  const r = await saveRole(
    id,
    { name: String(input?.name ?? ""), description: String(input?.description ?? ""), permissions: Array.isArray(input?.permissions) ? input.permissions : [] },
    g.viewer,
  );
  return r.ok ? done(g.e.admin.roleSaved) : { ok: false, error: r.error };
}

export async function deleteRoleAction(id: number): Promise<ActionResult> {
  const g = await gate("staff.manage");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.admin.roleNotFound };
  const r = await deleteRole(id, g.viewer);
  return r.ok ? done(g.e.admin.roleDeleted) : { ok: false, error: r.error };
}

/* ---------- member blocklist ---------- */

function blockMessage(e: Dict["errors"], error: BlockError): string {
  const m: Record<BlockError, string> = {
    bank: e.admin.blockBank,
    phone: e.admin.blockPhone,
    name: e.admin.blockName,
    reason: e.admin.reasonRequired,
    exists: e.admin.blockExists,
    notReady: e.admin.blockNotReady,
    notFound: e.admin.blockNotFound,
    nothing: e.admin.blockPickOne,
  };
  return m[error];
}

/** Block a bank account (one bank or any), a phone, or a first name and surname. Needs members.block. */
export async function addBlockAction(
  input: { kind: string; bankCode?: string | null; value?: string; first?: string; last?: string },
  reason: string,
): Promise<ActionResult> {
  const g = await gate("members.block");
  if ("refusal" in g) return g.refusal;
  if (!isBlockKind(input?.kind)) return { ok: false, error: g.e.generic.invalid };
  const bankCode = input.bankCode ? String(input.bankCode) : null;
  if (bankCode && !BANKS.some((b) => b.code === bankCode)) return { ok: false, error: g.e.admin.bankInvalid };
  const r = await addBlock(
    {
      kind: input.kind,
      bankCode,
      value: String(input.value ?? "").slice(0, 40),
      first: String(input.first ?? "").slice(0, 80),
      last: String(input.last ?? "").slice(0, 80),
    },
    String(reason ?? ""),
    { id: g.viewer.id, ip: g.ip },
  );
  return r.ok ? done(fmt(g.e.admin.blockAdded, { n: r.members })) : { ok: false, error: blockMessage(g.e, r.error) };
}

/** Lift a block, with a reason. Needs members.block. */
export async function removeBlockAction(id: number, reason: string): Promise<ActionResult> {
  const g = await gate("members.block");
  if ("refusal" in g) return g.refusal;
  if (!isId(id)) return { ok: false, error: g.e.admin.blockNotFound };
  const r = await removeBlock(id, String(reason ?? ""), { id: g.viewer.id, ip: g.ip });
  return r.ok ? done(g.e.admin.blockRemoved) : { ok: false, error: blockMessage(g.e, r.error) };
}

/** Block a member by their own account, phone, and/or name (from the member page). Needs members.block. */
export async function blockMemberAction(userId: number, parts: string[], reason: string): Promise<ActionResult> {
  const g = await gate("members.block");
  if ("refusal" in g) return g.refusal;
  if (!isId(userId)) return { ok: false, error: g.e.admin.memberNotFound };
  const kinds = (Array.isArray(parts) ? parts : []).filter(isBlockKind);
  const r = await blockMember(userId, kinds, String(reason ?? ""), { id: g.viewer.id, ip: g.ip });
  return r.ok ? done(fmt(g.e.admin.memberBlocked, { n: r.created })) : { ok: false, error: blockMessage(g.e, r.error) };
}

/* ---------- point activities ---------- */

/** Lucky wheel and guessing-game settings. Needs promotions.manage; every change is audited. */
export async function saveActivitiesAction(input: ActivitySettings): Promise<ActionResult> {
  const g = await gate("promotions.manage");
  if ("refusal" in g) return g.refusal;
  const w = input?.wheel;
  const q = input?.guess;
  if (!w || !q) return { ok: false, error: g.e.generic.incomplete };
  const known = new Set((await listLottos({ includeDisabled: true })).map((l) => l.id));
  const next: ActivitySettings = {
    wheel: {
      enabled: !!w.enabled,
      cost: Number(w.cost),
      dailyLimit: Number(w.dailyLimit),
      turnoverX: Number(w.turnoverX),
      dailyBudget: Number(w.dailyBudget),
      prizes: (Array.isArray(w.prizes) ? w.prizes : []).slice(0, 13).map((p) => ({ amount: Number(p?.amount), chance: Number(p?.chance) })),
    },
    guess: {
      enabled: !!q.enabled,
      cost: Number(q.cost),
      prize: Number(q.prize),
      maxPerRound: Number(q.maxPerRound),
      roundBudget: Number(q.roundBudget),
      turnoverX: Number(q.turnoverX),
      lottoIds: [...new Set((Array.isArray(q.lottoIds) ? q.lottoIds : []).map(Number))].filter((id) => known.has(id)),
    },
  };
  const a = g.e.activities;
  const wheelError = wheelProblem(next.wheel);
  if (wheelError) {
    const m = { cost: a.badCost, limit: a.badLimit, prizes: a.badPrizes, chances: a.badChances, turnover: a.badTurnover, budget: a.badBudget } as const;
    return { ok: false, error: m[wheelError] };
  }
  const guessError = guessProblem(next.guess);
  if (guessError) {
    const m = { cost: a.badCost, prize: a.badPrize, limit: a.badMax, budget: a.badBudget, turnover: a.badTurnover, lottos: a.badLottos } as const;
    return { ok: false, error: m[guessError] };
  }
  const current = await getSetting("activities");
  await setSetting("activities", next);
  await audit(g.viewer.id, "settings.activities", "activities", changes(flat({ ...current }), flat({ ...next })), Date.now(), g.ip);
  return done(a.saved);
}

/* ---------- game products (the member site syncs the catalog; admin only switches products on/off) ---------- */

/** Offer a product to members, or take it off the lobby. */
export async function setGameProductAction(productId: string, enabled: boolean): Promise<ActionResult> {
  const g = await gate("games.manage");
  if ("refusal" in g) return g.refusal;
  if (typeof productId !== "string" || !/^[A-Za-z0-9_]{1,40}$/.test(productId)) return { ok: false, error: g.e.games.notFound };
  const changed = (await run("UPDATE game_products SET enabled = ? WHERE product_id = ?", enabled ? 1 : 0, productId)).changes;
  if (!changed) return { ok: false, error: g.e.games.notFound };
  invalidate("games:");
  await audit(g.viewer.id, "games.product", `product:${productId}`, { enabled: !!enabled }, Date.now(), g.ip);
  return done(enabled ? g.e.games.productOn : g.e.games.productOff);
}

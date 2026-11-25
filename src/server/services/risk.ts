import "server-only";
import { marginalRate100 } from "chokprathan-core/rules/pricing";
import { betRules } from "chokprathan-core/rules/quote";
import type { RoundConfig } from "chokprathan-core/rules/roundConfig";
import type { BetTypeCode, ManualLimit } from "chokprathan-core/rules/types";
import { invalidate, memo } from "@/server/cache";
import { afterCommit, q, q1, run, tolerateMissingTable } from "@/server/db";
import { audit } from "./audit";
import { betConfigs, getLotto, listLottos, type BetConfig } from "./lottos";
import { getRoundConfig } from "./round-configs";
import { getRound } from "./rounds";
import { getSettings } from "./settings";

export interface LimitBadge {
  betType: BetTypeCode;
  number: string;
  /** null = closed */
  rate100: number | null;
  baseRate100: number;
  source: "auto" | "manual";
}

const keyOf = (betType: string, number: string) => `${betType}:${number}`;

type ManualRow = { round_id: number; bet_type: BetTypeCode; number: string; kind: "percent" | "closed"; percent: number | null };
type ExposureLite = { round_id: number; bet_type: BetTypeCode; number: string; total_stake: number };

const toLimit = (r: Pick<ManualRow, "kind" | "percent">): ManualLimit =>
  r.kind === "closed" ? { kind: "closed" } : { kind: "percent", percent: r.percent ?? 100 };

/** A round's own prices (its first package); the lottery's current ones until it has a config. */
const configsOf = (own: RoundConfig | undefined, current: () => BetConfig[]): BetConfig[] =>
  own ? betRules(own).map((c) => ({ ...c, customRisk: false })) : current();

// The table arrives with member migration 12.
const ownConfig = async (roundId: number) => (await tolerateMissingTable(() => getRoundConfig(roundId), undefined))?.config;

/** The smallest total at which any profile starts cutting: rows below it can never carry a badge. */
function cutFloor(configs: BetConfig[]): number {
  let floor = Infinity;
  for (const c of configs) {
    if (!c.profile.enabled) continue;
    for (const t of c.profile.tiers) floor = Math.min(floor, t.threshold);
    if (c.profile.cap !== null) floor = Math.min(floor, c.profile.cap);
  }
  return Number.isFinite(floor) ? floor : Number.MAX_SAFE_INTEGER;
}

function badgesFor(configs: Map<BetTypeCode, BetConfig>, exposures: ExposureLite[], manual: ManualRow[]): LimitBadge[] {
  const totals = new Map(exposures.map((e) => [keyOf(e.bet_type, e.number), e]));
  const manualMap = new Map(manual.map((m) => [keyOf(m.bet_type, m.number), m]));
  const keys = new Set([...totals.keys(), ...manualMap.keys()]);
  const badges: LimitBadge[] = [];
  for (const key of keys) {
    const exp = totals.get(key);
    const man = manualMap.get(key);
    const betType = (exp?.bet_type ?? man?.bet_type)!;
    const number = (exp?.number ?? man?.number)!;
    const cfg = configs.get(betType);
    if (!cfg) continue;
    const total = exp?.total_stake ?? 0;
    const limit = man ? toLimit(man) : null;
    const rate100 = marginalRate100(cfg.rate100, cfg.profile, limit, total);
    if (rate100 !== null && rate100 >= cfg.rate100) continue;
    const autoRate = marginalRate100(cfg.rate100, cfg.profile, null, total);
    badges.push({ betType, number, rate100, baseRate100: cfg.rate100, source: rate100 === autoRate ? "auto" : "manual" });
  }
  return badges.sort((a, b) => a.betType.localeCompare(b.betType) || a.number.localeCompare(b.number));
}

/**
 * Cut and closed numbers for many rounds with two queries (the lobby shows a count per round).
 * Returns an empty list for rounds with nothing cut.
 */
export async function limitsForRounds(roundIds: number[]): Promise<Map<number, LimitBadge[]>> {
  const out = new Map<number, LimitBadge[]>(roundIds.map((id) => [id, []]));
  if (roundIds.length === 0) return out;
  const [settings, lottos] = await Promise.all([getSettings(), listLottos({ includeDisabled: true })]);
  const rounds = await q<{ id: number; lotto_id: number }>("SELECT id, lotto_id FROM rounds WHERE id IN (?)", roundIds);
  const stored = new Map(await Promise.all(rounds.map(async (r) => [r.id, await ownConfig(r.id)] as const)));
  const configsByRound = new Map<number, Map<BetTypeCode, BetConfig>>();
  let floor = Number.MAX_SAFE_INTEGER;
  for (const r of rounds) {
    const lotto = lottos.find((l) => l.id === r.lotto_id);
    if (!lotto) continue;
    const configs = configsOf(stored.get(r.id), () => betConfigs(lotto, settings));
    floor = Math.min(floor, cutFloor(configs));
    configsByRound.set(r.id, new Map(configs.map((c) => [c.code, c])));
  }
  const [exposures, manual] = await Promise.all([
    q<ExposureLite>("SELECT round_id, bet_type, number, total_stake FROM exposures WHERE round_id IN (?) AND total_stake >= ?", roundIds, floor),
    q<ManualRow>("SELECT round_id, bet_type, number, kind, percent FROM manual_limits WHERE round_id IN (?)", roundIds),
  ]);
  for (const [roundId, configs] of configsByRound) {
    out.set(
      roundId,
      badgesFor(
        configs,
        exposures.filter((e) => e.round_id === roundId),
        manual.filter((m) => m.round_id === roundId),
      ),
    );
  }
  return out;
}

/** Every number whose next baht would be paid below the base rate, or not accepted at all. Cached briefly. */
export function roundLimits(roundId: number): Promise<LimitBadge[]> {
  return memo(`limits:${roundId}`, 3_000, async () => (await limitsForRounds([roundId])).get(roundId) ?? []);
}

export async function setManualLimit(
  roundId: number,
  betType: BetTypeCode,
  number: string,
  limit: ManualLimit | null,
  actorId: number,
  now = Date.now(),
) {
  if (limit === null) {
    await run("DELETE FROM manual_limits WHERE round_id = ? AND bet_type = ? AND number = ?", roundId, betType, number);
  } else {
    await run(
      `INSERT INTO manual_limits (round_id, bet_type, number, kind, percent, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE kind = VALUES(kind), percent = VALUES(percent),
         created_at = VALUES(created_at), created_by = VALUES(created_by)`,
      roundId,
      betType,
      number,
      limit.kind,
      limit.kind === "percent" ? limit.percent : null,
      now,
      actorId,
    );
  }
  await audit(actorId, limit ? "risk.manual.set" : "risk.manual.clear", `round:${roundId}`, { betType, number, limit }, now);
  invalidate(`limits:${roundId}`, "lobby");
  afterCommit(() => invalidate(`limits:${roundId}`, "lobby"));
}

export interface ExposureRow {
  betType: BetTypeCode;
  number: string;
  total: number;
  potential: number;
  bills: number;
  rate100: number | null;
  baseRate100: number;
  manual: ManualLimit | null;
}

/** The prices bets on this round are taken at: its stored config, else the lottery's current settings. */
export async function roundBetConfigs(roundId: number): Promise<BetConfig[]> {
  const round = await getRound(roundId);
  const lotto = round && (await getLotto(round.lottoId));
  if (!lotto) return [];
  const settings = await getSettings();
  return configsOf(await ownConfig(roundId), () => betConfigs(lotto, settings));
}

/** Numbers ranked by what the house would pay if they hit. */
export async function exposureTable(roundId: number, { betType, limit = 60 }: { betType?: BetTypeCode; limit?: number } = {}): Promise<ExposureRow[]> {
  const round = await getRound(roundId);
  const lotto = round && (await getLotto(round.lottoId));
  if (!round || !lotto) return [];
  const configs = new Map((await roundBetConfigs(roundId)).map((c) => [c.code, c]));
  const manualRows = await q<ManualRow>("SELECT round_id, bet_type, number, kind, percent FROM manual_limits WHERE round_id = ?", roundId);
  const manual = new Map(manualRows.map((m) => [keyOf(m.bet_type, m.number), toLimit(m)]));
  const rows = await q<{ bet_type: BetTypeCode; number: string; total_stake: number; potential: number }>(
    `SELECT bet_type, number, total_stake, potential FROM exposures
     WHERE round_id = ? ${betType ? "AND bet_type = ?" : ""} AND total_stake > 0
     ORDER BY potential DESC LIMIT ?`,
    ...(betType ? [roundId, betType, limit] : [roundId, limit]),
  );
  const counts =
    rows.length === 0
      ? []
      : await q<{ bet_type: string; number: string; n: number }>(
          `SELECT bet_type, number, COUNT(DISTINCT bill_id) AS n FROM bill_items
           WHERE round_id = ? AND status = 'pending' AND number IN (?)
           GROUP BY bet_type, number`,
          roundId,
          [...new Set(rows.map((r) => r.number))],
        );
  const billCount = new Map(counts.map((c) => [keyOf(c.bet_type, c.number), c.n]));
  return rows.map((r) => {
    const cfg = configs.get(r.bet_type);
    const man = manual.get(keyOf(r.bet_type, r.number)) ?? null;
    return {
      betType: r.bet_type,
      number: r.number,
      total: r.total_stake,
      potential: r.potential,
      bills: billCount.get(keyOf(r.bet_type, r.number)) ?? 0,
      rate100: cfg ? marginalRate100(cfg.rate100, cfg.profile, man, r.total_stake) : null,
      baseRate100: cfg?.rate100 ?? 0,
      manual: man,
    };
  });
}

export async function manualLimitList(roundId: number) {
  const rows = await q<ManualRow>("SELECT round_id, bet_type, number, kind, percent FROM manual_limits WHERE round_id = ? ORDER BY bet_type, number", roundId);
  return rows.map((r) => ({ betType: r.bet_type, number: r.number, limit: toLimit(r) }));
}

export async function roundTotals(roundId: number) {
  return (await q1<{ stake: number | null; bills: number; members: number }>(
    `SELECT SUM(total_stake) AS stake, COUNT(*) AS bills, COUNT(DISTINCT user_id) AS members
     FROM bills WHERE round_id = ? AND status IN ('pending','won','lost')`,
    roundId,
  ))!;
}

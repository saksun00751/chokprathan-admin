import "server-only";
import { BET_TYPES, betTypesFor } from "@/domain/betTypes";
import type { BetTypeCode, LottoGroup, ResultFormat, RiskProfile, Schedule } from "@/domain/types";
import { invalidate, memo } from "@/server/cache";
import { afterCommit, json, q } from "@/server/db";
import { getSettings, type AllSettings } from "./settings";

export interface LottoLimitsOverride {
  minStake?: number;
  maxPerBill?: number;
  maxPerNumber?: Partial<Record<BetTypeCode, number>>;
}

export interface Lotto {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  group: LottoGroup;
  format: ResultFormat;
  schedule: Schedule;
  resultDelayMin: number;
  autoResult: boolean;
  enabled: boolean;
  sort: number;
  flag: string | null;
  rates: Partial<Record<BetTypeCode, number>>;
  limits: LottoLimitsOverride;
  risk: Partial<Record<BetTypeCode, RiskProfile>>;
}

interface LottoRow {
  id: number;
  slug: string;
  name: string;
  short_name: string;
  grp: LottoGroup;
  format: ResultFormat;
  schedule: string;
  result_delay_min: number;
  auto_result: number;
  enabled: number;
  sort: number;
  flag: string | null;
  rates: string;
  limits: string;
  risk: string;
}

function toLotto(r: LottoRow): Lotto {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    shortName: r.short_name,
    group: r.grp,
    format: r.format,
    schedule: json.parse<Schedule>(r.schedule, { kind: "weekly", days: [], close: "00:00" }),
    resultDelayMin: r.result_delay_min,
    autoResult: r.auto_result === 1,
    enabled: r.enabled === 1,
    sort: r.sort,
    flag: r.flag,
    rates: json.parse(r.rates, {}),
    limits: json.parse(r.limits, {}),
    risk: json.parse(r.risk, {}),
  };
}

/** The whole catalog, cached briefly: it is small, read on every page, and changes rarely. */
function allLottos(): Promise<Lotto[]> {
  return memo("lottos", 5_000, async () => (await q<LottoRow>("SELECT * FROM lottos ORDER BY sort, id")).map(toLotto));
}

export function invalidateLottos() {
  invalidate("lottos", "lobby", "limits:", "results");
  afterCommit(() => invalidate("lottos", "lobby", "limits:", "results"));
}

export async function listLottos({ includeDisabled = false } = {}): Promise<Lotto[]> {
  const all = await allLottos();
  return includeDisabled ? all : all.filter((l) => l.enabled);
}

export async function getLotto(id: number): Promise<Lotto | undefined> {
  return (await allLottos()).find((l) => l.id === id);
}

export async function getLottoBySlug(slug: string): Promise<Lotto | undefined> {
  return (await allLottos()).find((l) => l.slug === slug);
}

export interface BetConfig {
  code: BetTypeCode;
  digits: number;
  rate100: number;
  maxPerNumber: number;
  minStake: number;
  profile: RiskProfile;
  /** true when this lotto overrides the global risk profile for this bet type */
  customRisk: boolean;
}

/** Effective per-bet-type configuration: lotto overrides on top of global settings. */
export function betConfigs(lotto: Lotto, settings: Pick<AllSettings, "rates" | "risk" | "limits">): BetConfig[] {
  const { rates, risk, limits } = settings;
  return betTypesFor(lotto.format).map((code) => ({
    code,
    digits: BET_TYPES[code].digits,
    rate100: lotto.rates[code] ?? rates[code],
    maxPerNumber: lotto.limits.maxPerNumber?.[code] ?? limits.maxPerNumber[code],
    minStake: lotto.limits.minStake ?? limits.minStake,
    profile: lotto.risk[code] ?? risk[code],
    customRisk: lotto.risk[code] !== undefined,
  }));
}

export function billLimits(lotto: Lotto, { limits }: Pick<AllSettings, "limits">) {
  return {
    minStake: lotto.limits.minStake ?? limits.minStake,
    maxPerBill: lotto.limits.maxPerBill ?? limits.maxPerBill,
    maxLines: limits.maxLines,
  };
}

/** betConfigs with the current settings. */
export async function loadBetConfigs(lotto: Lotto): Promise<BetConfig[]> {
  return betConfigs(lotto, await getSettings());
}

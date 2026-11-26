import "server-only";
import { buildRoundConfig, type RoundConfig, type RoundConfigInput } from "chokprathan-core/rules/roundConfig";
import type { BetTypeCode, RiskProfile } from "chokprathan-core/rules/types";
import { json, q, q1, run, tx } from "@/server/db";
import { audit } from "./audit";
import { mirrorLegacyConfig } from "./config-mirror";
import { freshSettings } from "./fresh-settings";
import { listLottos } from "./lottos";
import { getSettings } from "./settings";

const OFF: RiskProfile = { enabled: false, tiers: [], cap: null };

type BetRow = { lotto_id: number; bet_type: BetTypeCode; enabled: number; min_stake: number; max_per_number: number; profile: string };
type PackageRow = { lotto_id: number; id: number; code: string; name: string; sort: number };
type RateRow = { package_id: number; bet_type: BetTypeCode; rate100: number; discount_bp: number };
type OverrideRow = { lotto_id: number; package_id: number; bet_type: BetTypeCode; rate100: number | null; discount_bp: number | null };

/** Today's configuration of every lottery that can take bets, as the JSON a round stores. */
async function currentConfigs(): Promise<Map<number, string>> {
  freshSettings();
  const [lottos, settings, bets, packages, rates, overrides] = await Promise.all([
    listLottos({ includeDisabled: true }),
    getSettings(),
    q<BetRow>(
      "SELECT b.lotto_id, b.bet_type, b.enabled, b.min_stake, b.max_per_number, p.profile FROM lotto_bet_types b JOIN risk_profiles p ON p.id = b.risk_profile_id",
    ),
    q<PackageRow>(
      "SELECT l.lotto_id, p.id, p.code, p.name, p.sort FROM lotto_packages l JOIN price_packages p ON p.id = l.package_id WHERE p.active = 1",
    ),
    q<RateRow>("SELECT package_id, bet_type, rate100, discount_bp FROM package_rates"),
    q<OverrideRow>("SELECT lotto_id, package_id, bet_type, rate100, discount_bp FROM lotto_rate_overrides"),
  ]);
  const out = new Map<number, string>();
  for (const lotto of lottos) {
    const input: RoundConfigInput = {
      format: lotto.format,
      maxPerBill: lotto.limits.maxPerBill ?? settings.limits.maxPerBill,
      maxLines: settings.limits.maxLines,
      betTypes: bets
        .filter((b) => b.lotto_id === lotto.id)
        .map((b) => ({
          code: b.bet_type,
          enabled: b.enabled === 1,
          minStake: b.min_stake,
          maxPerNumber: b.max_per_number,
          risk: json.parse<RiskProfile>(b.profile, OFF),
        })),
      packages: packages
        .filter((p) => p.lotto_id === lotto.id)
        .map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          sort: p.sort,
          rates: Object.fromEntries(rates.filter((r) => r.package_id === p.id).map((r) => [r.bet_type, { rate100: r.rate100, discountBp: r.discount_bp }])),
          overrides: Object.fromEntries(
            overrides
              .filter((o) => o.lotto_id === lotto.id && o.package_id === p.id)
              .map((o) => [o.bet_type, { rate100: o.rate100, discountBp: o.discount_bp }]),
          ),
        })),
    };
    const built = buildRoundConfig(input);
    if (built.ok) out.set(lotto.id, json.str(built.config));
    else console.error(`[round-configs] lottery ${lotto.id} has no usable configuration: ${built.error}`);
  }
  return out;
}

/** A round with any bill, a cancelled one included, keeps its prices until staff apply new ones. */
export async function roundHasBills(roundId: number): Promise<boolean> {
  return !!(await q1("SELECT id FROM bills WHERE round_id = ? LIMIT 1", roundId));
}

type Candidate = { id: number; lotto_id: number; version: number | null; config: string | null };

/**
 * Give every round still open for the future the current configuration, as long as it has no bill.
 * A round with a bill keeps what it has.
 */
export async function syncRoundConfigs(now = Date.now()): Promise<{ created: number; updated: number }> {
  const configs = await currentConfigs();
  const rounds = await q<Candidate>(
    `SELECT r.id, r.lotto_id, c.version, c.config FROM rounds r
     LEFT JOIN round_configs c ON c.round_id = r.id AND c.version = (SELECT MAX(x.version) FROM round_configs x WHERE x.round_id = r.id)
     WHERE r.status = 'scheduled' AND r.closes_at > ? AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.round_id = r.id)`,
    now,
  );
  let created = 0;
  let updated = 0;
  for (const r of rounds) {
    const want = configs.get(r.lotto_id);
    if (want === undefined || want === r.config) continue;
    await tx(async () => {
      // Betting share-locks the round row, so this waits for a bill in flight and then sees it.
      if (!(await q1("SELECT id FROM rounds WHERE id = ? AND status = 'scheduled' FOR UPDATE", r.id))) return;
      if (await roundHasBills(r.id)) return;
      if (r.version === null) {
        // IGNORE: another process may have stored the first version meanwhile.
        created += (await run("INSERT IGNORE INTO round_configs (round_id, version, config, created_at) VALUES (?, 1, ?, ?)", r.id, want, now)).changes;
      } else {
        updated += (await run("UPDATE round_configs SET config = ?, created_at = ? WHERE round_id = ? AND version = ?", want, now, r.id, r.version)).changes;
      }
    });
  }
  return { created, updated };
}

/** The configuration bets on this round are priced against (its latest version). */
export async function getRoundConfig(roundId: number): Promise<{ version: number; config: RoundConfig } | undefined> {
  const row = await q1<{ version: number; config: string }>("SELECT version, config FROM round_configs WHERE round_id = ? ORDER BY version DESC LIMIT 1", roundId);
  const config = row && json.parse<RoundConfig | null>(row.config, null);
  return row && config ? { version: row.version, config } : undefined;
}

export type ApplyOutcome = { ok: true; version: number } | { ok: false; error: "notFound" | "notOpen" | "unchanged" | "noConfig" };

/**
 * Put the current settings onto one round that already has bills, as a new version. Bills accepted so
 * far keep their prices; the ones after this are priced from the new version.
 */
export async function applyConfigToRound(roundId: number, actorId: number, now = Date.now(), ip: string | null = null): Promise<ApplyOutcome> {
  await mirrorLegacyConfig(now);
  const configs = await currentConfigs();
  return tx(async (): Promise<ApplyOutcome> => {
    // Exclusive: waits for bets in flight, which hold the round shared.
    const round = await q1<{ lotto_id: number; status: string; closes_at: number }>("SELECT lotto_id, status, closes_at FROM rounds WHERE id = ? FOR UPDATE", roundId);
    if (!round) return { ok: false, error: "notFound" };
    if (round.status !== "scheduled" || now >= round.closes_at) return { ok: false, error: "notOpen" };
    const last = await q1<{ version: number; config: string }>("SELECT version, config FROM round_configs WHERE round_id = ? ORDER BY version DESC LIMIT 1", roundId);
    const want = configs.get(round.lotto_id);
    if (!last || want === undefined) return { ok: false, error: "noConfig" };
    if (want === last.config) return { ok: false, error: "unchanged" };
    const version = last.version + 1;
    await run("INSERT INTO round_configs (round_id, version, config, created_at, created_by) VALUES (?, ?, ?, ?, ?)", roundId, version, want, now, actorId);
    await audit(actorId, "round.config", `round:${roundId}`, { from: last.version, to: version }, now, ip);
    return { ok: true, version };
  });
}

/**
 * Mirror the lottery settings and bring round configs up to date. Never throws: saving a setting or
 * creating a round must not fail because of it, and the scheduler runs it again.
 */
export async function refreshRoundConfigs(now = Date.now()): Promise<void> {
  try {
    await mirrorLegacyConfig(now);
    await syncRoundConfigs(now);
  } catch (error) {
    // 1146: the tables arrive with member migration 12.
    if ((error as { errno?: number }).errno === 1146) return;
    console.error("[round-configs] refresh failed:", error instanceof Error ? error.message : error);
  }
}

import "server-only";
import { BET_TYPE_ORDER, betTypesFor } from "chokprathan-core/rules/betTypes";
import type { BetTypeCode, RiskProfile } from "chokprathan-core/rules/types";
import { json, q1, run, tx } from "@/server/db";
import { listLottos } from "./lottos";
import { getSettings } from "./settings";

export const STANDARD_PACKAGE = "standard";

async function saveProfile(code: string, profile: RiskProfile, now: number): Promise<number> {
  await run(
    "INSERT INTO risk_profiles (code, name, profile, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE profile = VALUES(profile), updated_at = VALUES(updated_at)",
    code,
    code,
    json.str(profile),
    now,
  );
  return (await q1<{ id: number }>("SELECT id FROM risk_profiles WHERE code = ?", code))!.id;
}

/**
 * Copy what staff edit today (rate settings and each lottery's own rates, limits and risk) into the
 * normalised tables: the `standard` package, bet types and risk profiles. The old editor stays the
 * source until the new screens write these tables directly; delete this file then.
 */
export async function mirrorLegacyConfig(now = Date.now()): Promise<void> {
  const [lottos, settings] = await Promise.all([listLottos({ includeDisabled: true }), getSettings()]);
  await tx(async () => {
    await run("INSERT IGNORE INTO price_packages (code, name, sort, updated_at) VALUES (?, ?, 0, ?)", STANDARD_PACKAGE, "มาตรฐาน", now);
    const packageId = (await q1<{ id: number }>("SELECT id FROM price_packages WHERE code = ?", STANDARD_PACKAGE))!.id;
    const defaults = new Map<BetTypeCode, number>();
    for (const code of BET_TYPE_ORDER) {
      await run(
        "INSERT INTO package_rates (package_id, bet_type, rate100, discount_bp) VALUES (?, ?, ?, 0) ON DUPLICATE KEY UPDATE rate100 = VALUES(rate100), discount_bp = VALUES(discount_bp)",
        packageId,
        code,
        settings.rates[code],
      );
      defaults.set(code, await saveProfile(`default-${code}`, settings.risk[code], now));
    }
    for (const lotto of lottos) {
      await run("INSERT IGNORE INTO lotto_packages (lotto_id, package_id) VALUES (?, ?)", lotto.id, packageId);
      await run("DELETE FROM lotto_rate_overrides WHERE lotto_id = ? AND package_id = ?", lotto.id, packageId);
      for (const code of betTypesFor(lotto.format)) {
        const own = lotto.risk[code];
        const profileId = own ? await saveProfile(`lotto-${lotto.id}-${code}`, own, now) : defaults.get(code)!;
        await run(
          `INSERT INTO lotto_bet_types (lotto_id, bet_type, enabled, min_stake, max_per_number, risk_profile_id) VALUES (?, ?, 1, ?, ?, ?)
           ON DUPLICATE KEY UPDATE min_stake = VALUES(min_stake), max_per_number = VALUES(max_per_number), risk_profile_id = VALUES(risk_profile_id)`,
          lotto.id,
          code,
          lotto.limits.minStake ?? settings.limits.minStake,
          lotto.limits.maxPerNumber?.[code] ?? settings.limits.maxPerNumber[code],
          profileId,
        );
        const rate = lotto.rates[code];
        if (rate !== undefined) {
          await run("INSERT INTO lotto_rate_overrides (lotto_id, package_id, bet_type, rate100) VALUES (?, ?, ?, ?)", lotto.id, packageId, code, rate);
        }
      }
    }
  });
}

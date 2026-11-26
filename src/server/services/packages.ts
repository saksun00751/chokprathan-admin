import "server-only";
import { randomBytes } from "node:crypto";
import { BET_TYPE_ORDER, isBetTypeCode } from "@/core/rules/betTypes";
import { MAX_DISCOUNT_BP, type PackageRate } from "@/core/rules/roundConfig";
import type { BetTypeCode } from "@/core/rules/types";
import { q, q1, run, tx } from "@/server/db";
import { audit } from "./audit";
import { STANDARD_PACKAGE } from "./config-mirror";
import { refreshRoundConfigs } from "./round-configs";

/**
 * Price packages staff add beside `standard`. The standard one is copied from the rate editor
 * (config-mirror) and every lottery offers it, so it is not edited here. A package is never deleted:
 * bills point at it; it is switched off.
 */

export type Overrides = Partial<Record<BetTypeCode, { rate100: number | null; discountBp: number | null }>>;

export interface PricePackage {
  id: number;
  name: string;
  active: boolean;
  sort: number;
  standard: boolean;
  rates: Partial<Record<BetTypeCode, PackageRate>>;
  /** Lotteries offering it (not listed for `standard`: all do). */
  lottos: { lottoId: number; overrides: Overrides }[];
}

export interface PackageInput {
  name: string;
  sort: number;
  active: boolean;
  rates: Partial<Record<BetTypeCode, PackageRate>>;
}

export async function listPackages(): Promise<PricePackage[]> {
  const [packs, rates, offers, overrides] = await Promise.all([
    q<{ id: number; code: string; name: string; active: number; sort: number }>("SELECT id, code, name, active, sort FROM price_packages ORDER BY sort, id"),
    q<{ package_id: number; bet_type: BetTypeCode; rate100: number; discount_bp: number }>("SELECT package_id, bet_type, rate100, discount_bp FROM package_rates"),
    q<{ lotto_id: number; package_id: number }>("SELECT lotto_id, package_id FROM lotto_packages ORDER BY lotto_id"),
    q<{ lotto_id: number; package_id: number; bet_type: BetTypeCode; rate100: number | null; discount_bp: number | null }>(
      "SELECT lotto_id, package_id, bet_type, rate100, discount_bp FROM lotto_rate_overrides",
    ),
  ]);
  return packs.map((p) => {
    const own = rates.filter((r) => r.package_id === p.id);
    const standard = p.code === STANDARD_PACKAGE;
    return {
      id: p.id,
      name: p.name,
      active: p.active === 1,
      sort: p.sort,
      standard,
      rates: Object.fromEntries(
        BET_TYPE_ORDER.flatMap((code) => {
          const r = own.find((x) => x.bet_type === code);
          return r ? [[code, { rate100: r.rate100, discountBp: r.discount_bp }]] : [];
        }),
      ),
      lottos: standard
        ? []
        : offers
            .filter((o) => o.package_id === p.id)
            .map((o) => ({
              lottoId: o.lotto_id,
              overrides: Object.fromEntries(
                overrides
                  .filter((x) => x.package_id === p.id && x.lotto_id === o.lotto_id)
                  .map((x) => [x.bet_type, { rate100: x.rate100, discountBp: x.discount_bp }]),
              ),
            })),
    };
  });
}

const isRate = (v: unknown) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 10_000_000;
const isDiscount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_DISCOUNT_BP;

export type SavePackageOutcome = { ok: true; id: number } | { ok: false; error: "standard" | "name" | "noRates" | "rate" | "discount" | "notFound" };

/** Create (`id` null) or change a package and its rates. */
export async function savePackage(id: number | null, input: PackageInput, actorId: number, now = Date.now(), ip: string | null = null): Promise<SavePackageOutcome> {
  const name = input.name.trim().slice(0, 60);
  if (name.length < 2) return { ok: false, error: "name" };
  const rates = BET_TYPE_ORDER.flatMap((code) => (input.rates[code] ? [[code, input.rates[code]!] as const] : []));
  if (rates.length === 0) return { ok: false, error: "noRates" };
  if (rates.some(([, r]) => !isRate(r.rate100))) return { ok: false, error: "rate" };
  if (rates.some(([, r]) => !isDiscount(r.discountBp))) return { ok: false, error: "discount" };
  const sort = Number.isInteger(input.sort) ? Math.min(Math.max(input.sort, 0), 10_000) : 0;

  const outcome = await tx(async (): Promise<SavePackageOutcome> => {
    let packageId = id;
    if (packageId === null) {
      packageId = (
        await run(
          "INSERT INTO price_packages (code, name, active, sort, updated_at) VALUES (?, ?, ?, ?, ?)",
          `p${randomBytes(4).toString("hex")}`,
          name,
          input.active ? 1 : 0,
          sort,
          now,
        )
      ).lastId;
    } else {
      const found = await q1<{ code: string }>("SELECT code FROM price_packages WHERE id = ? FOR UPDATE", packageId);
      if (!found) return { ok: false, error: "notFound" };
      if (found.code === STANDARD_PACKAGE) return { ok: false, error: "standard" };
      await run("UPDATE price_packages SET name = ?, active = ?, sort = ?, updated_at = ? WHERE id = ?", name, input.active ? 1 : 0, sort, now, packageId);
    }
    await run("DELETE FROM package_rates WHERE package_id = ?", packageId);
    for (const [code, r] of rates) {
      await run("INSERT INTO package_rates (package_id, bet_type, rate100, discount_bp) VALUES (?, ?, ?, ?)", packageId, code, r.rate100, r.discountBp);
    }
    await audit(actorId, id === null ? "package.create" : "package.update", `package:${packageId}`, { name, active: input.active, rates: Object.fromEntries(rates) }, now, ip);
    return { ok: true, id: packageId };
  });
  if (outcome.ok) await refreshRoundConfigs(now);
  return outcome;
}

export type OfferOutcome = { ok: true } | { ok: false; error: "standard" | "rate" | "discount" | "notFound" };

/** Offer a package on a lottery (with the lottery's own values, if any) or stop offering it. */
export async function setLottoPackage(
  lottoId: number,
  packageId: number,
  { offered, overrides }: { offered: boolean; overrides: Overrides },
  actorId: number,
  now = Date.now(),
  ip: string | null = null,
): Promise<OfferOutcome> {
  const own = Object.entries(offered ? overrides : {}).filter(([code, v]) => isBetTypeCode(code) && v && (v.rate100 !== null || v.discountBp !== null)) as [
    BetTypeCode,
    { rate100: number | null; discountBp: number | null },
  ][];
  if (own.some(([, v]) => v.rate100 !== null && !isRate(v.rate100))) return { ok: false, error: "rate" };
  if (own.some(([, v]) => v.discountBp !== null && !isDiscount(v.discountBp))) return { ok: false, error: "discount" };

  const outcome = await tx(async (): Promise<OfferOutcome> => {
    const pack = await q1<{ code: string }>("SELECT code FROM price_packages WHERE id = ? FOR UPDATE", packageId);
    if (!pack || !(await q1("SELECT id FROM lottos WHERE id = ?", lottoId))) return { ok: false, error: "notFound" };
    if (pack.code === STANDARD_PACKAGE) return { ok: false, error: "standard" };
    await run("DELETE FROM lotto_rate_overrides WHERE lotto_id = ? AND package_id = ?", lottoId, packageId);
    if (offered) {
      await run("INSERT IGNORE INTO lotto_packages (lotto_id, package_id) VALUES (?, ?)", lottoId, packageId);
      for (const [code, v] of own) {
        await run(
          "INSERT INTO lotto_rate_overrides (lotto_id, package_id, bet_type, rate100, discount_bp) VALUES (?, ?, ?, ?, ?)",
          lottoId,
          packageId,
          code,
          v.rate100,
          v.discountBp,
        );
      }
    } else {
      await run("DELETE FROM lotto_packages WHERE lotto_id = ? AND package_id = ?", lottoId, packageId);
    }
    await audit(actorId, "package.offer", `package:${packageId}`, { lottoId, offered, overrides: Object.fromEntries(own) }, now, ip);
    return { ok: true };
  });
  if (outcome.ok) await refreshRoundConfigs(now);
  return outcome;
}

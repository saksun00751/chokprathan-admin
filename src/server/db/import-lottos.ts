import "server-only";
import { audit } from "@/server/services/audit";
import { json, q, q1, run, tx } from "./index";
import { parseMarkets, planImport, type ImportPlan } from "./import-lottos-map";
import { DAILY_GROUP } from "./import-lottos-names";

export type ImportReport = ImportPlan & { applied: boolean };

/**
 * Add the lotteries of a `lotto_markets` dump, switched off with manual results and no rates of
 * their own. A slug already taken is skipped and left as it is, so running it again is safe.
 * Without `apply` nothing is written.
 */
export async function importLottos(sql: string, { apply, now = Date.now() }: { apply: boolean; now?: number }): Promise<ImportReport> {
  const column = await q1("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottos' AND COLUMN_NAME = 'i18n'");
  if (!column) throw new Error("lottos.i18n does not exist yet: run member migration 17 first (npm run db -- migrate in the member repo)");
  const plan = planImport(parseMarkets(sql));
  return tx(async () => {
    const taken = new Set((await q<{ slug: string }>("SELECT slug FROM lottos")).map((r) => r.slug));
    const lottos = plan.lottos.filter((l) => !taken.has(l.slug));
    const skipped = [...plan.skipped, ...plan.lottos.filter((l) => taken.has(l.slug)).map((l) => ({ slug: l.slug, reason: "slug already exists" }))];
    const report: ImportReport = { ...plan, lottos, skipped, applied: false };
    if (!apply) return report;
    if (plan.problems.length) throw new Error(`nothing imported, fix these first:\n${plan.problems.join("\n")}`);
    if (!lottos.length) return report;
    if (lottos.some((l) => l.group === DAILY_GROUP.code)) {
      const g = DAILY_GROUP;
      // IGNORE: staff may have renamed or moved the group already.
      await run("INSERT IGNORE INTO lotto_groups (code, name, i18n, art, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?)", g.code, g.name, json.str(g.i18n), g.art, g.sort, now);
    }
    let sort = (await q1<{ n: number | null }>("SELECT MAX(sort) AS n FROM lottos"))?.n ?? 0;
    for (const l of lottos) {
      await run(
        `INSERT INTO lottos (slug, name, short_name, i18n, grp, format, schedule, result_delay_min, auto_result, enabled, sort, flag, rates, limits, risk, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, '{}', '{}', '{}', ?)`,
        l.slug,
        l.name,
        l.name,
        json.str(l.i18n),
        l.group,
        l.format,
        json.str(l.schedule),
        l.resultDelayMin,
        ++sort,
        l.flag,
        now,
      );
    }
    await audit(null, "lotto.import", null, { count: lottos.length, slugs: lottos.map((l) => l.slug), via: "db import-lottos" }, now);
    return { ...report, applied: true };
  });
}

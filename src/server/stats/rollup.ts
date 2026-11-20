import "server-only";
import { DAY, MINUTE } from "@/domain/time";
import { q } from "@/server/db";
import { COLL, mongoDb } from "@/server/mongo";
import { buildRounds, buildSpan, changedDays, firstDay, roundsFinishedSince } from "./build";
import { dayOf, planRollup } from "./derive";
import { isCurrent, spans } from "./load";
import { saveRounds, saveSpan, type RollupMeta } from "./store";
import type { DayStats } from "./types";

/** Status changes are looked for this far behind the last run, to catch slow commits. */
const LOOKBACK = 10 * MINUTE;
/** Days rebuilt per run beyond today and yesterday (changed days first, then backfill). */
const BUDGET = 6;

/** One scheduler run: today, days whose bills changed, a slice of missing history, finished rounds. */
export async function rollupStats(now = Date.now()): Promise<void> {
  const db = await mongoDb();
  if (!db) return;
  const metas = db.collection<RollupMeta>(COLL.statsMeta);
  const meta = (await metas.findOne({ _id: "rollup" })) ?? { _id: "rollup", cursor: now - DAY, dirty: [], ranAt: 0, complete: false };
  const today = dayOf(now);
  const dirty = [...new Set([...meta.dirty, ...(await changedDays(meta.cursor - LOOKBACK))])].filter((d) => d < today);

  const first = await firstDay();
  const missing: number[] = [];
  if (first !== null) {
    const docs = await db
      .collection<DayStats>(COLL.statsDays)
      .find({ _id: { $gte: first, $lt: today } }, { projection: { _id: 1, builtAt: 1 } })
      .toArray();
    const current = new Set(docs.filter((x) => isCurrent(x, now)).map((x) => x._id));
    for (let d = today - 1; d >= first; d--) if (!current.has(d)) missing.push(d);
  }

  const plan = planRollup({ now, changed: dirty, missing, budget: BUDGET });
  for (const [from, to] of spans(plan)) await saveSpan(db, await buildSpan(from, to, now));
  const done = new Set(plan);

  const finished = await roundsFinishedSince(meta.cursor - LOOKBACK);
  for (let i = 0; i < finished.length; i += 500) await saveRounds(db, await buildRounds(finished.slice(i, i + 500), now));

  await metas.updateOne(
    { _id: "rollup" },
    { $set: { cursor: now, dirty: dirty.filter((d) => !done.has(d)), ranAt: now, complete: missing.every((d) => done.has(d)) } },
    { upsert: true },
  );
}

/** `npm run db -- stats-rebuild`: every day from the first activity to today, and every finished round. */
export async function rebuildAllStats(log: (line: string) => void, now = Date.now()): Promise<number> {
  const db = await mongoDb();
  if (!db) throw new Error("MONGODB_URL is not set or MongoDB cannot be reached");
  const first = await firstDay();
  const today = dayOf(now);
  let days = 0;
  if (first !== null) {
    for (let from = first; from <= today; from += 31) {
      const to = Math.min(from + 30, today);
      await saveSpan(db, await buildSpan(from, to, now));
      days += to - from + 1;
      log(`  days ${from - first + 1}..${to - first + 1} of ${today - first + 1}`);
    }
  }
  const finished = (await q<{ id: number }>("SELECT id FROM rounds WHERE settled_at IS NOT NULL ORDER BY id")).map((x) => Number(x.id));
  for (let i = 0; i < finished.length; i += 500) await saveRounds(db, await buildRounds(finished.slice(i, i + 500), now));
  await db
    .collection<RollupMeta>(COLL.statsMeta)
    .updateOne({ _id: "rollup" }, { $set: { cursor: now, dirty: [], ranAt: now, complete: true } }, { upsert: true });
  log(`stats rebuilt: ${days} day(s), ${finished.length} finished round(s)`);
  return days;
}

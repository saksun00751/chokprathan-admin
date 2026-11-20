import "server-only";
import { hostname } from "node:os";
import { outsideTx, run, withLock } from "@/server/db";
import { pruneEmployeeSessions } from "./employee-auth";
import { expireDeposits } from "./finance";
import { pruneRateLimits } from "./ratelimit";
import { autoResults, ensureRounds, resumeSettlements } from "./rounds";
import { settlePendingGuesses } from "./activities";
import { rollupStats } from "@/server/stats/rollup";
import { sealAudit, verifyAudit } from "./audit";

/**
 * Background work: create upcoming rounds, draw auto-result rounds, finish interrupted
 * settlements, expire deposits, and clean up old rows. Every app instance runs the timer, but
 * a MariaDB named lock lets only one of them do the work at a time. The admin app uses its own
 * lock name so it never contends with the member app's scheduler.
 */
type State = {
  timer?: ReturnType<typeof setInterval>;
  lastTick: number;
  lastEnsure: number;
  lastPrune: number;
  lastStats?: number;
  lastVerify?: number;
  ticking: boolean;
};
const state = ((globalThis as unknown as { __chokprathanAdminScheduler?: State }).__chokprathanAdminScheduler ??= {
  lastTick: 0,
  lastEnsure: 0,
  lastPrune: 0,
  ticking: false,
});

export const LOCK_NAME = "chokprathan-admin:scheduler";
/** Set SCHEDULER=off to run this instance without background work. */
export const schedulerEnabled = () => process.env.SCHEDULER !== "off";

const TICK_MS = 20_000;
const ENSURE_EVERY = 5 * 60_000;
const PRUNE_EVERY = 60 * 60_000;
/** Dashboard and report summaries in MongoDB (no-op without MongoDB). */
const STATS_EVERY = 60_000;
/** Full walk of the audit hash chain (sealing runs every tick). */
const VERIFY_EVERY = 6 * 60 * 60_000;

export async function tick(now = Date.now()) {
  if (state.ticking) return;
  state.ticking = true;
  try {
    const r = await withLock(LOCK_NAME, async () => {
      if (now - state.lastEnsure > ENSURE_EVERY) {
        await ensureRounds(now);
        state.lastEnsure = now;
      }
      await autoResults(now);
      await resumeSettlements(now);
      await settlePendingGuesses(now).catch((error) => console.error("[scheduler] guess settlement failed:", error instanceof Error ? error.message : error));
      await expireDeposits(now);
      if (now - state.lastPrune > PRUNE_EVERY) {
        await pruneEmployeeSessions(now);
        await pruneRateLimits(now);
        state.lastPrune = now;
      }
      await sealAudit(now).catch((error) => console.error("[scheduler] audit sealing failed:", error instanceof Error ? error.message : error));
      if (now - (state.lastVerify ?? 0) >= VERIFY_EVERY) {
        state.lastVerify = now;
        await verifyAudit(now).catch((error) => console.error("[scheduler] audit verification failed:", error instanceof Error ? error.message : error));
      }
      if (now - (state.lastStats ?? 0) >= STATS_EVERY) {
        state.lastStats = now;
        // Summaries are rebuilt on read when stale, so a failure here only costs speed, never numbers.
        await rollupStats(now).catch((error) => console.error("[scheduler] stats rollup failed:", error instanceof Error ? error.message : error));
      }
      await run(
        "INSERT INTO system_status (name, `value`, updated_at) VALUES ('scheduler', ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = VALUES(updated_at)",
        JSON.stringify({ host: hostname(), pid: process.pid }),
        now,
      );
    });
    if (r.ran) state.lastTick = now;
  } finally {
    state.ticking = false;
  }
}

/** Start the timer once per process (called from instrumentation at server start). */
export function startScheduler() {
  if (state.timer || !schedulerEnabled()) return;
  // Never inherit a request's transaction context.
  outsideTx(() => {
    state.timer = setInterval(() => {
      tick().catch((error) => console.error("[scheduler] tick failed", error));
    }, TICK_MS);
    state.timer.unref?.();
    tick().catch((error) => console.error("[scheduler] first tick failed", error));
  });
}

export const schedulerState = () => ({ running: !!state.timer, lastTick: state.lastTick });

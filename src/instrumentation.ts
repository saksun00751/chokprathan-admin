/**
 * Runs once when a Next.js server process starts: bring the database schema up to date and
 * start the background scheduler. Skipped while `next build` prerenders pages.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL) {
    console.error("[startup] DATABASE_URL is not set; the app cannot reach MariaDB");
    return;
  }
  const { migrate } = await import("@/server/db/migrate");
  const { startScheduler } = await import("@/server/services/scheduler");
  const { ensureMongoIndexes, mongoConfigured } = await import("@/server/mongo");
  try {
    if (process.env.DB_AUTO_MIGRATE !== "false") {
      await migrate((line) => console.info(line));
      // MongoDB is optional: without it every feature uses MariaDB, so a failure here never stops startup.
      if (mongoConfigured()) await ensureMongoIndexes((line) => console.info(line)).catch((error) => console.error("[startup] mongo indexes:", error instanceof Error ? error.message : error));
    }
    startScheduler();
  } catch (error) {
    console.error("[startup] database not ready:", error instanceof Error ? error.message : error);
  }
}

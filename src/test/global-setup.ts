/**
 * Runs once before the test files: rebuilds the schema from scratch on the disposable test
 * database so it always matches the migrations in the code. Skipped when no test DB is set.
 */
export default async function setup() {
  if (!process.env.DATABASE_URL || process.env.ALLOW_DB_RESET !== "yes-destroy-data") return;
  const { dropAppTables, migrate } = await import("@/server/db/migrate");
  const { closePool } = await import("@/server/db");
  await dropAppTables();
  await migrate();
  await closePool();
}

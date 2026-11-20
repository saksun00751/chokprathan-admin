import { setCacheEnabled } from "@/server/cache";
import { pinned, q, run } from "@/server/db";
import { truncateAppTables } from "@/server/db/migrate";
import { canTruncateAll } from "./reset-guard";

/** Database-backed tests need a disposable MariaDB: TEST_DATABASE_URL plus ALLOW_DB_RESET. */
export const hasTestDb = !!process.env.DATABASE_URL && process.env.ALLOW_DB_RESET === "yes-destroy-data";

/**
 * Empty every table (schema stays) and turn caches off so each test sees its own writes.
 * By default only the admin tables are emptied. With TEST_TRUNCATE_ALL=yes-wipe-every-table (a test
 * database that also holds the member schema) every base table except the two migration-version
 * tables is emptied as well; that mode refuses unless the database name ends with `_test`.
 */
export async function resetDb() {
  setCacheEnabled(false);
  if (process.env.TEST_TRUNCATE_ALL) await truncateAllTables();
  else await truncateAppTables();
}

async function truncateAllTables() {
  const allowed = canTruncateAll(process.env.DATABASE_URL, process.env);
  if (!allowed.ok) throw new Error(`Refusing TEST_TRUNCATE_ALL: ${allowed.reason}`);
  await pinned(async () => {
    const tables = await q<{ name: string }>(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
         AND TABLE_NAME NOT IN ('schema_migrations', 'schema_migrations_admin')`,
    );
    await run("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const { name } of tables) await run(`TRUNCATE TABLE \`${name.replace(/`/g, "``")}\``);
    } finally {
      await run("SET FOREIGN_KEY_CHECKS = 1");
    }
  });
}

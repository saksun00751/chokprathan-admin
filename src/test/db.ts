import { setCacheEnabled } from "@/server/cache";
import { truncateAppTables } from "@/server/db/migrate";

/** Database-backed tests need a disposable MariaDB: TEST_DATABASE_URL plus ALLOW_DB_RESET. */
export const hasTestDb = !!process.env.DATABASE_URL && process.env.ALLOW_DB_RESET === "yes-destroy-data";

/** Empty every table (schema stays) and turn caches off so each test sees its own writes. */
export async function resetDb() {
  setCacheEnabled(false);
  await truncateAppTables();
}

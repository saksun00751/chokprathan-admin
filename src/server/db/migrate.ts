// src/server/db/migrate.ts
import "server-only";
import { pinned, q, q1, run, withLock } from "./index";
import { APP_TABLES, MIGRATIONS } from "./migrations";

/** Apply pending admin migrations. Own version table and lock: never collides with the member app's migrator. */
export async function migrate(log: (line: string) => void = () => {}): Promise<number> {
  const result = await withLock(
    "chokprathan-admin:migrate",
    async () => {
      await run(`CREATE TABLE IF NOT EXISTS schema_migrations_admin (
        version INT NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        applied_at BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      const done = new Set((await q<{ version: number }>("SELECT version FROM schema_migrations_admin")).map((r) => r.version));
      let applied = 0;
      for (const m of MIGRATIONS) {
        if (done.has(m.version)) continue;
        for (const statement of m.statements) await run(statement);
        await run("INSERT INTO schema_migrations_admin (version, name, applied_at) VALUES (?, ?, ?)", m.version, m.name, Date.now());
        log(`[db] admin migration ${m.version} applied: ${m.name}`);
        applied++;
      }
      return applied;
    },
    60,
  );
  if (!result.ran) throw new Error("Another process is migrating the database; gave up after 60 seconds");
  return result.value;
}

export async function schemaVersion(): Promise<number> {
  const exists = await q1("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations_admin'");
  if (!exists) return 0;
  return (await q1<{ v: number | null }>("SELECT MAX(version) AS v FROM schema_migrations_admin"))?.v ?? 0;
}

/** Test databases only: drops the admin tables. Refuses unless ALLOW_DB_RESET is set. */
export async function dropAppTables(): Promise<void> {
  if (process.env.ALLOW_DB_RESET !== "yes-destroy-data") throw new Error("Refusing to drop tables: set ALLOW_DB_RESET=yes-destroy-data");
  await pinned(async () => {
    await run("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const table of APP_TABLES) await run(`DROP TABLE IF EXISTS ${table}`);
    } finally {
      await run("SET FOREIGN_KEY_CHECKS = 1");
    }
  });
}

/** Test databases only: empties the admin tables, keeping the schema. */
export async function truncateAppTables(): Promise<void> {
  if (process.env.ALLOW_DB_RESET !== "yes-destroy-data") throw new Error("Refusing to truncate: set ALLOW_DB_RESET=yes-destroy-data");
  await pinned(async () => {
    await run("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const table of APP_TABLES) if (table !== "schema_migrations_admin") await run(`TRUNCATE TABLE ${table}`);
    } finally {
      await run("SET FOREIGN_KEY_CHECKS = 1");
    }
  });
}

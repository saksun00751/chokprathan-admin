import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Database tests run against TEST_DATABASE_URL (a disposable MariaDB; every run wipes it).
// They are skipped when it is not set. Production installs refuse to be wiped either way.
const fileEnv = loadEnv("test", process.cwd(), "");
const testDb = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
// globalSetup runs in this process, so the variables must be set here as well as for the workers.
if (testDb) Object.assign(process.env, { DATABASE_URL: testDb, ALLOW_DB_RESET: "yes-destroy-data", SETTLE_CHUNK: "3" });
else process.env.DATABASE_URL = "";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only throws outside React Server Components; tests run server code directly.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Shared rules ship as TypeScript source.
    server: { deps: { inline: ["chokprathan-core"] } },
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    env: testDb ? { DATABASE_URL: testDb, ALLOW_DB_RESET: "yes-destroy-data", SETTLE_CHUNK: "3" } : { DATABASE_URL: "" },
    globalSetup: ["src/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});

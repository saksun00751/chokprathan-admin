// src/server/db/migrate.test.ts
import { describe, expect, it } from "vitest";
import { hasTestDb } from "@/test/db";
import { q1 } from "@/server/db";
import { migrate, schemaVersion } from "@/server/db/migrate";

describe.skipIf(!hasTestDb)("admin migrations", () => {
  it("creates the employee tables and is safe to run twice", async () => {
    await migrate();
    expect(await migrate()).toBe(0);
    expect(await schemaVersion()).toBeGreaterThanOrEqual(1);
    for (const t of ["employees", "employee_roles", "employee_sessions", "employee_session_ends", "employee_login_challenges", "employee_login_attempts", "employee_auth_log"]) {
      expect(await q1("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", t), t).toBeTruthy();
    }
  });
});

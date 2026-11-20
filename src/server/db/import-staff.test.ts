// src/server/db/import-staff.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, resetDb } from "@/test/db";
import { pinned, q, q1, run } from "@/server/db";
import { importStaff } from "@/server/db/import-staff";

// Deviation from the plan: the shared test DB may hold the member app's real tables, whose foreign keys point at
// users/staff_roles, so the drops/creates run on one pinned connection with FK checks off.
async function legacy() {
  await pinned(async () => {
    await run("SET FOREIGN_KEY_CHECKS = 0");
    try {
      await legacyTables();
    } finally {
      await run("SET FOREIGN_KEY_CHECKS = 1");
    }
  });
}

async function legacyTables() {
  await run("DROP TABLE IF EXISTS users");
  await run("DROP TABLE IF EXISTS staff_roles");
  await run("CREATE TABLE staff_roles (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(60), description VARCHAR(200), permissions TEXT, is_owner TINYINT(1), created_at BIGINT, updated_at BIGINT)");
  await run(`CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(40), password_hash VARCHAR(200), name VARCHAR(100),
    role VARCHAR(10), status VARCHAR(10), staff_role_id INT, totp_secret VARCHAR(64), totp_enabled TINYINT(1), totp_last_step BIGINT,
    must_change_password TINYINT(1), staff_note VARCHAR(255), created_at BIGINT, last_login_at BIGINT, last_ip VARCHAR(45))`);
  await run("INSERT INTO staff_roles VALUES (1,'Owner','', '[\"*\"]',1,1,1),(2,'Cashier','','[\"finance.view\"]',0,1,1)");
  await run(`INSERT INTO users (id,username,password_hash,name,role,status,staff_role_id,totp_enabled,must_change_password,created_at) VALUES
    (3,NULL,'h','Member A','member','active',NULL,0,0,1),
    (7,'owner','hash-owner','Owner','staff','active',1,1,0,10),
    (9,'cash','hash-cash','Cashier','staff','suspended',2,0,1,20),
    (12,NULL,'h','Member B','member','active',NULL,0,0,30)`);
}

describe.skipIf(!hasTestDb)("importStaff", () => {
  beforeEach(async () => {
    await resetDb();
    await legacy();
  });

  it("copies staff with their original ids and never copies members", async () => {
    const r = await importStaff();
    expect(r).toEqual({ roles: 2, employees: 2 });
    const rows = await q<{ id: number; username: string; employee_role_id: number; status: string; note: string | null }>("SELECT id, username, employee_role_id, status, note FROM employees ORDER BY id");
    expect(rows.map((x) => [x.id, x.username, x.employee_role_id, x.status])).toEqual([
      [7, "owner", 1, "active"],
      [9, "cash", 2, "suspended"],
    ]);
  });

  it("is idempotent, and refresh overwrites changed fields", async () => {
    await importStaff();
    await run("UPDATE users SET password_hash = 'new-hash' WHERE id = 9");
    await importStaff(); // no refresh: keeps the employee row as it is
    expect((await q1<{ password_hash: string }>("SELECT password_hash FROM employees WHERE id = 9"))?.password_hash).toBe("hash-cash");
    await importStaff({ refresh: true });
    expect((await q1<{ password_hash: string }>("SELECT password_hash FROM employees WHERE id = 9"))?.password_hash).toBe("new-hash");
    expect((await q1<{ n: number }>("SELECT COUNT(*) AS n FROM employees"))?.n).toBe(2);
  });

  it("does nothing when the legacy columns are already gone", async () => {
    await run("ALTER TABLE users DROP COLUMN role");
    expect(await importStaff()).toEqual({ roles: 0, employees: 0 });
  });

  it("does nothing after the contract step: staff_role_id column and staff_roles table are gone while role still exists", async () => {
    await run("ALTER TABLE users DROP COLUMN staff_role_id");
    await run("DROP TABLE staff_roles");
    expect(await importStaff()).toEqual({ roles: 0, employees: 0 });
    expect(await q1("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'")).toBeTruthy();
  });

  it("does nothing when only staff_roles is gone", async () => {
    await run("DROP TABLE staff_roles");
    expect(await importStaff()).toEqual({ roles: 0, employees: 0 });
    expect((await q1<{ n: number }>("SELECT COUNT(*) AS n FROM employees"))?.n).toBe(0);
  });
});

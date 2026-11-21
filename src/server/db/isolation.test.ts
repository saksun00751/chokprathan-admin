/**
 * Database user isolation: checks scripts/grants.sql on a real server. Skipped (not failed) unless
 * ISOLATION_MEMBER_URL and ISOLATION_ADMIN_URL are both set, so a normal `npm test` never runs it.
 *
 * How to run, on a DISPOSABLE MariaDB only (the negative checks try DROP / DELETE on real tables,
 * so a wrong grant would destroy data):
 *   1. Create the database and run the member app's migrations there as root
 *      (member repo: DATABASE_URL=mysql://root:...@127.0.0.1/lotto npm run db -- migrate),
 *      then this app's (DATABASE_URL=mysql://root:...@127.0.0.1/lotto npm run db -- migrate).
 *   2. Apply the grants as root: mariadb -u root -p < scripts/grants.sql   (database name `lotto`).
 *   3. TEST_DATABASE_URL= \
 *      ISOLATION_MEMBER_URL=mysql://chok_member:CHANGE-ME-MEMBER@127.0.0.1/lotto \
 *      ISOLATION_ADMIN_URL=mysql://chok_admin:CHANGE-ME-ADMIN@127.0.0.1/lotto \
 *      npx vitest run src/server/db/isolation.test.ts
 *      (the empty TEST_DATABASE_URL matters: otherwise vitest.config reads it from .env* files and the
 *      global setup drops and re-migrates the app tables of that test database before this file runs)
 * Every positive check touches no row (WHERE id = -1 and similar).
 */
import mysql, { type Connection } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { ISOLATION_MEMBER_URL: memberUrl, ISOLATION_ADMIN_URL: adminUrl } = process.env;
const TABLE_DENIED = { code: "ER_TABLEACCESS_DENIED_ERROR" };
const COLUMN_DENIED = { code: "ER_COLUMNACCESS_DENIED_ERROR" };
const ADMIN_OWNED = [
  "employees",
  "employee_roles",
  "employee_sessions",
  "employee_session_ends",
  "employee_login_challenges",
  "employee_login_attempts",
  "employee_auth_log",
  "schema_migrations_admin",
  "audit_log",
];

describe.skipIf(!memberUrl || !adminUrl)("database user isolation", () => {
  let member: Connection;
  let admin: Connection;
  beforeAll(async () => {
    member = await mysql.createConnection(memberUrl!);
    admin = await mysql.createConnection(adminUrl!);
  });
  afterAll(async () => {
    await member?.end();
    await admin?.end();
  });

  it("member cannot read or write admin-owned tables", async () => {
    for (const t of ADMIN_OWNED) {
      await expect(member.query(`SELECT 1 FROM ${t} LIMIT 1`), t).rejects.toMatchObject(TABLE_DENIED);
    }
    await expect(member.query("DELETE FROM audit_log WHERE id = -1")).rejects.toMatchObject(TABLE_DENIED);
  });

  it("member keeps DML on its own tables but cannot change the schema", async () => {
    await expect(member.query("SELECT 1 FROM users LIMIT 1")).resolves.toBeTruthy();
    await expect(member.query("UPDATE users SET ref_code = ref_code WHERE id = -1")).resolves.toBeTruthy();
    await expect(member.query("DELETE FROM sessions WHERE token_hash = 'x'")).resolves.toBeTruthy();
    await expect(member.query("CREATE TABLE isolation_probe (id INT)")).rejects.toMatchObject(TABLE_DENIED);
    await expect(member.query("DROP TABLE bills")).rejects.toMatchObject(TABLE_DENIED);
  });

  it("admin has what it needs", async () => {
    await expect(admin.query("SELECT 1 FROM employees LIMIT 1")).resolves.toBeTruthy();
    await expect(admin.query("SELECT 1 FROM audit_log LIMIT 1")).resolves.toBeTruthy();
    await expect(admin.query("SELECT 1 FROM bills LIMIT 1")).resolves.toBeTruthy();
    // wallet.move / settlement and member edits: column-level UPDATE on users.
    await expect(admin.query("UPDATE users SET balance = balance WHERE id = -1")).resolves.toBeTruthy();
    await expect(admin.query("UPDATE users SET status = status, staff_note = staff_note WHERE id = -1")).resolves.toBeTruthy();
    // revokeAllMemberSessions.
    await expect(
      admin.query("INSERT IGNORE INTO session_ends (token_hash, user_id, reason, ended_at, by_ip) SELECT token_hash, user_id, 'revoked', 0, NULL FROM sessions WHERE user_id = -1"),
    ).resolves.toBeTruthy();
    await expect(admin.query("DELETE FROM sessions WHERE token_hash = 'x'")).resolves.toBeTruthy();
    // Scheduler heartbeat shape and login throttle purge.
    await expect(admin.query("UPDATE system_status SET updated_at = updated_at WHERE name = '__isolation_probe__'")).resolves.toBeTruthy();
    await expect(admin.query("DELETE FROM rate_limits WHERE window_start < -1")).resolves.toBeTruthy();
  });

  it("admin cannot write beyond its grants or change the shared schema", async () => {
    await expect(admin.query("DELETE FROM bills WHERE id = -1")).rejects.toMatchObject(TABLE_DENIED);
    await expect(admin.query("DELETE FROM users WHERE id = -1")).rejects.toMatchObject(TABLE_DENIED);
    await expect(admin.query("DELETE FROM transactions WHERE id = -1")).rejects.toMatchObject(TABLE_DENIED);
    await expect(admin.query("UPDATE transactions SET amount = amount WHERE id = -1")).rejects.toMatchObject(TABLE_DENIED);
    await expect(admin.query("INSERT INTO bills (id) VALUES (-1)")).rejects.toMatchObject(TABLE_DENIED);
    // users: only the granted columns are writable.
    await expect(admin.query("UPDATE users SET ref_code = ref_code WHERE id = -1")).rejects.toMatchObject(COLUMN_DENIED);
    // session_ends is INSERT only.
    await expect(admin.query("SELECT 1 FROM session_ends LIMIT 1")).rejects.toMatchObject(TABLE_DENIED);
    // Schema changes on shared tables.
    await expect(admin.query("DROP TABLE users")).rejects.toMatchObject(TABLE_DENIED);
    await expect(admin.query("DROP TABLE bills")).rejects.toMatchObject(TABLE_DENIED);
    await expect(admin.query("ALTER TABLE users ADD COLUMN isolation_probe INT NULL")).rejects.toMatchObject(TABLE_DENIED);
    await expect(admin.query("CREATE TABLE isolation_probe (id INT)")).rejects.toMatchObject(TABLE_DENIED);
  });

  it("admin cannot read tables it was not granted", async () => {
    for (const t of ["auth_log", "otps", "login_attempts", "login_challenges", "ref_clicks", "games", "schema_migrations"]) {
      await expect(admin.query(`SELECT 1 FROM ${t} LIMIT 1`), t).rejects.toMatchObject(TABLE_DENIED);
    }
  });
});

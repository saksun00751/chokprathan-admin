// src/server/services/employee-auth.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, resetDb } from "@/test/db";
import { run } from "@/server/db";
import { checkEmployeeLogin, createEmployeeSession, employeeFromToken, hashPassword, revokeAllEmployeeSessions } from "@/server/services/employee-auth";

const client = { ip: "1.2.3.4", userAgent: "vitest" };

async function seed() {
  await run("INSERT INTO employee_roles (id,name,description,permissions,is_owner,created_at,updated_at) VALUES (1,'Cashier','','[\"finance.view\"]',0,1,1)");
  await run(
    "INSERT INTO employees (id,username,password_hash,name,employee_role_id,created_at) VALUES (5,'cash',?,'Cashier',1,1)",
    await hashPassword("correct horse 9"),
  );
}

describe.skipIf(!hasTestDb)("employee auth", () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it("accepts the right password and rejects a wrong one with the same error as an unknown user", async () => {
    const ok = await checkEmployeeLogin("cash", "correct horse 9", client);
    expect(ok).toMatchObject({ ok: true, employeeId: 5, needsTotp: false });
    const bad = await checkEmployeeLogin("cash", "nope", client);
    const unknown = await checkEmployeeLogin("ghost", "nope", client);
    expect(bad).toEqual(unknown);
  });

  it("locks an account after 5 failures", async () => {
    for (let i = 0; i < 5; i++) await checkEmployeeLogin("cash", "bad", client);
    const r = await checkEmployeeLogin("cash", "correct horse 9", client);
    expect(r.ok).toBe(false);
  });

  it("keeps one live session per employee: the first is replaced", async () => {
    const a = await createEmployeeSession(5, client, 1_000);
    const b = await createEmployeeSession(5, client, 2_000);
    expect(await employeeFromToken(a.token, 3_000)).toBeNull();
    const me = await employeeFromToken(b.token, 3_000);
    expect(me).toMatchObject({ id: 5, permissions: ["finance.view"], isOwner: false });
  });

  it("ends an idle session after 2 hours", async () => {
    const s = await createEmployeeSession(5, client, 0);
    expect(await employeeFromToken(s.token, 2 * 3_600_000 + 1)).toBeNull();
  });

  it("revokeAll signs the employee out everywhere", async () => {
    const s = await createEmployeeSession(5, client, 0);
    await revokeAllEmployeeSessions(5);
    expect(await employeeFromToken(s.token, 1)).toBeNull();
  });
});

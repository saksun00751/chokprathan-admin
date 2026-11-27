import { beforeEach, describe, expect, test } from "vitest";
import { run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { checkEmployeeLogin } from "./employee-auth";
import { createStaff, deleteStaff, listStaff, listStaffNames, resetStaffPassword, resetStaffTotp, saveRole, updateStaff, type StaffActor } from "./employees";

const now = Date.UTC(2026, 10, 8, 5, 0);
const MANAGER = ["dashboard.view", "members.view", "staff.manage"];

async function role(name: string, permissions: string[], isOwner = false) {
  return (
    await run(
      "INSERT INTO employee_roles (name, permissions, is_owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      name,
      JSON.stringify(permissions),
      isOwner ? 1 : 0,
      now,
      now,
    )
  ).lastId;
}

async function account(username: string, roleId: number) {
  const r = await createStaff({ username, name: username, password: "Passw0rd-long", roleId }, null, { now });
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

describe.skipIf(!hasTestDb)("staff management cannot escalate privileges", () => {
  let ownerRole: number;
  let managerRole: number;
  let ownerId: number;
  let manager: StaffActor;
  let owner: StaffActor;

  beforeEach(async () => {
    await resetDb();
    ownerRole = await role("เจ้าของ", ["*"], true);
    managerRole = await role("ผู้จัดการ", MANAGER);
    ownerId = await account("owner", ownerRole);
    manager = { id: await account("boss", managerRole), isOwner: false, permissions: MANAGER };
    owner = { id: ownerId, isOwner: true, permissions: ["*"] };
  });

  test("a staff manager cannot make an owner, or make themselves one", async () => {
    expect((await createStaff({ username: "mole", name: "mole", password: "Passw0rd-long", roleId: ownerRole }, manager, { now })).ok).toBe(false);
    expect((await updateStaff(manager.id, { name: "boss", roleId: ownerRole, status: "active" }, manager)).ok).toBe(false);
    expect((await createStaff({ username: "helper", name: "helper", password: "Passw0rd-long", roleId: ownerRole }, owner, { now })).ok).toBe(true);
  });

  test("a staff manager cannot take over the owner account", async () => {
    expect((await resetStaffPassword(ownerId, "Temp-passw0rd", manager)).ok).toBe(false);
    expect((await resetStaffTotp(ownerId, manager)).ok).toBe(false);
    expect((await updateStaff(ownerId, { name: "owner", roleId: managerRole, status: "suspended" }, manager)).ok).toBe(false);
  });

  test("only an owner deletes staff, and never themselves", async () => {
    expect((await deleteStaff(ownerId, manager)).ok).toBe(false);
    expect((await deleteStaff(ownerId, owner)).ok).toBe(false);
    expect((await deleteStaff(manager.id, owner)).ok).toBe(true);
  });

  test("a deleted account leaves the list, cannot sign in and cannot be brought back", async () => {
    await deleteStaff(manager.id, owner);
    expect((await listStaff()).map((s) => s.id)).toEqual([ownerId]);
    expect((await listStaffNames()).map((s) => s.id)).toContain(manager.id);
    expect((await checkEmployeeLogin("boss", "Passw0rd-long", { ip: null, userAgent: null }, now)).ok).toBe(false);
    expect((await updateStaff(manager.id, { name: "boss", roleId: managerRole, status: "active" }, owner)).ok).toBe(false);
    expect((await resetStaffPassword(manager.id, "Temp-passw0rd", owner)).ok).toBe(false);
    expect((await resetStaffTotp(manager.id, owner)).ok).toBe(false);
    expect((await deleteStaff(manager.id, owner)).ok).toBe(false);
  });

  test("roles hold only what their editor holds", async () => {
    expect((await saveRole(null, { name: "การเงินพิเศษ", description: "", permissions: ["members.view", "finance.withdraw"] }, manager)).ok).toBe(false);
    expect((await saveRole(managerRole, { name: "ผู้จัดการ", description: "", permissions: [...MANAGER, "settings.manage"] }, manager)).ok).toBe(false);
    expect((await saveRole(null, { name: "ดูสมาชิก", description: "", permissions: ["members.view"] }, manager)).ok).toBe(true);
  });

  test("a staff manager can still run the people they outrank", async () => {
    const viewer = await role("ดูอย่างเดียว", ["dashboard.view"]);
    const clerk = await account("clerk", viewer);
    expect((await resetStaffPassword(clerk, "Temp-passw0rd", manager)).ok).toBe(true);
    expect((await updateStaff(clerk, { name: "clerk", roleId: viewer, status: "suspended" }, manager)).ok).toBe(true);
  });
});

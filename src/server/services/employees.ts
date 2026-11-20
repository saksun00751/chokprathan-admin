import "server-only";
import { errorsT } from "@/i18n/server";
import { ALL, canActOnRole, isPermission, mayEditRole, type Rank } from "@/domain/permissions";
import { json, q, q1, run, tx } from "@/server/db";
import { audit } from "./audit";
import { hashPassword, revokeAllEmployeeSessions, employeePasswordProblem } from "./employee-auth";

export interface StaffRole {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  isOwner: boolean;
  members: number;
}

export interface StaffMember {
  id: number;
  username: string;
  name: string;
  status: "active" | "suspended";
  roleId: number | null;
  roleName: string | null;
  isOwner: boolean;
  totpEnabled: boolean;
  lastLoginAt: number | null;
  lastIp: string | null;
  createdAt: number;
}

type Fail = { ok: false; error: string };

/**
 * The staff member doing the change. Every change below is checked against their own rank
 * (src/domain/permissions.ts): nobody grants a permission they lack, gives out or touches the owner
 * role unless they are an owner, or manages someone who outranks them.
 */
export type StaffActor = { id: number } & Rank;

async function roleRank(roleId: number): Promise<Rank | null> {
  const r = await q1<{ is_owner: number; permissions: string }>("SELECT is_owner, permissions FROM employee_roles WHERE id = ?", roleId);
  return r ? { isOwner: r.is_owner === 1, permissions: json.parse<string[]>(r.permissions, []) } : null;
}

/** The rank of a staff account (no role = no permissions), or null when there is no such employee. */
async function staffRank(userId: number): Promise<Rank | null> {
  const r = await q1<{ is_owner: number | null; permissions: string | null }>(
    "SELECT r.is_owner, r.permissions FROM employees e LEFT JOIN employee_roles r ON r.id = e.employee_role_id WHERE e.id = ?",
    userId,
  );
  return r ? { isOwner: r.is_owner === 1, permissions: json.parse<string[]>(r.permissions, []) } : null;
}

export async function listRoles(): Promise<StaffRole[]> {
  const rows = await q<{ id: number; name: string; description: string; permissions: string; is_owner: number; members: number }>(
    `SELECT r.*, (SELECT COUNT(*) FROM employees e WHERE e.employee_role_id = r.id) AS members
     FROM employee_roles r ORDER BY r.is_owner DESC, r.id`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: json.parse<string[]>(r.permissions, []),
    isOwner: r.is_owner === 1,
    members: r.members,
  }));
}

export async function listStaff(): Promise<StaffMember[]> {
  const rows = await q<{
    id: number;
    username: string;
    name: string;
    status: "active" | "suspended";
    employee_role_id: number | null;
    role_name: string | null;
    is_owner: number | null;
    totp_enabled: number;
    last_login_at: number | null;
    last_ip: string | null;
    created_at: number;
  }>(
    `SELECT e.id, e.username, e.name, e.status, e.employee_role_id, r.name AS role_name, r.is_owner, e.totp_enabled, e.last_login_at, e.last_ip, e.created_at
     FROM employees e LEFT JOIN employee_roles r ON r.id = e.employee_role_id ORDER BY e.created_at`,
  );
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    status: r.status,
    roleId: r.employee_role_id,
    roleName: r.role_name,
    isOwner: r.is_owner === 1,
    totpEnabled: r.totp_enabled === 1,
    lastLoginAt: r.last_login_at,
    lastIp: r.last_ip,
    createdAt: r.created_at,
  }));
}

const cleanPermissions = (list: unknown[]) => [...new Set(list.filter(isPermission))];

export async function saveRole(
  id: number | null,
  input: { name: string; description: string; permissions: unknown[] },
  actor: StaffActor,
): Promise<{ ok: true; id: number } | Fail> {
  const e = await errorsT();
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return { ok: false, error: e.staff.roleName };
  const permissions = cleanPermissions(input.permissions);
  if (permissions.length === 0) return { ok: false, error: e.staff.pickPermission };
  const now = Date.now();
  try {
    if (id === null) {
      if (!mayEditRole(actor, null, permissions)) return { ok: false, error: e.staff.cannotGrant };
      const newId = (
        await run(
          "INSERT INTO employee_roles (name, description, permissions, is_owner, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
          name,
          input.description.trim().slice(0, 200),
          json.str(permissions),
          now,
          now,
        )
      ).lastId;
      await audit(actor.id, "staff.role.create", `role:${newId}`, { name, permissions });
      return { ok: true, id: newId };
    }
    const role = await roleRank(id);
    if (!role) return { ok: false, error: e.staff.roleNotFound };
    if (role.isOwner) return { ok: false, error: e.staff.ownerLocked };
    if (!canActOnRole(actor, role)) return { ok: false, error: e.staff.outranked };
    if (!mayEditRole(actor, role, permissions)) return { ok: false, error: e.staff.cannotGrant };
    await run(
      "UPDATE employee_roles SET name = ?, description = ?, permissions = ?, updated_at = ? WHERE id = ?",
      name,
      input.description.trim().slice(0, 200),
      json.str(permissions),
      now,
      id,
    );
    await audit(actor.id, "staff.role.update", `role:${id}`, { name, permissions });
    return { ok: true, id };
  } catch (error) {
    if ((error as { errno?: number }).errno === 1062) return { ok: false, error: e.staff.roleTaken };
    throw error;
  }
}

export async function deleteRole(id: number, actor: StaffActor): Promise<{ ok: true } | Fail> {
  const e = await errorsT();
  const role = await q1<{ is_owner: number; members: number }>(
    "SELECT r.is_owner, (SELECT COUNT(*) FROM employees e WHERE e.employee_role_id = r.id) AS members FROM employee_roles r WHERE r.id = ?",
    id,
  );
  if (!role) return { ok: false, error: e.staff.roleNotFound };
  if (role.is_owner) return { ok: false, error: e.staff.ownerDelete };
  const rank = await roleRank(id);
  if (rank && !canActOnRole(actor, rank)) return { ok: false, error: e.staff.outranked };
  if (role.members > 0) return { ok: false, error: e.staff.roleInUse };
  await run("DELETE FROM employee_roles WHERE id = ?", id);
  await audit(actor.id, "staff.role.delete", `role:${id}`);
  return { ok: true };
}

/** Employee usernames (also checked by `npm run db -- create-owner`). */
export const USERNAME = /^[a-z][a-z0-9._-]{2,39}$/;

/** Create a staff account. It must change its password at first sign-in. */
export async function createStaff(
  input: { username: string; name: string; password: string; roleId: number },
  /** null only for the installer, which creates the first owner */
  actor: StaffActor | null,
  { mustChange = true, now = Date.now() }: { mustChange?: boolean; now?: number } = {},
): Promise<{ ok: true; id: number } | Fail> {
  const e = await errorsT();
  const username = input.username.trim().toLowerCase();
  if (!USERNAME.test(username)) return { ok: false, error: e.staff.username };
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) return { ok: false, error: e.staff.name };
  const problem = employeePasswordProblem(input.password, e);
  if (problem) return { ok: false, error: problem };
  const role = await roleRank(input.roleId);
  if (!role) return { ok: false, error: e.staff.pickRole };
  if (actor && !canActOnRole(actor, role)) return { ok: false, error: role.isOwner ? e.staff.ownerOnly : e.staff.cannotGrant };
  const hash = await hashPassword(input.password);
  try {
    const id = (
      await run(
        `INSERT INTO employees (username, password_hash, name, employee_role_id, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        username,
        hash,
        name,
        input.roleId,
        mustChange ? 1 : 0,
        now,
      )
    ).lastId;
    await audit(actor?.id ?? null, "staff.create", `user:${id}`, { username, roleId: input.roleId }, now);
    return { ok: true, id };
  } catch (error) {
    const err = error as { errno?: number; message?: string };
    if (err.errno === 1062 && String(err.message).includes("employees_username")) return { ok: false, error: e.staff.usernameTaken };
    throw error;
  }
}

async function activeOwners(exceptId?: number): Promise<number> {
  const r = await q1<{ n: number }>(
    `SELECT COUNT(*) AS n FROM employees e JOIN employee_roles r ON r.id = e.employee_role_id
     WHERE e.status = 'active' AND r.is_owner = 1 ${exceptId ? "AND e.id <> ?" : ""}`,
    ...(exceptId ? [exceptId] : []),
  );
  return r?.n ?? 0;
}

export async function updateStaff(
  id: number,
  input: { name: string; roleId: number; status: "active" | "suspended" },
  actor: StaffActor,
): Promise<{ ok: true } | Fail> {
  const e = await errorsT();
  return tx(async () => {
    const current = await q1<{ employee_role_id: number | null; status: string }>(
      "SELECT employee_role_id, status FROM employees WHERE id = ? FOR UPDATE",
      id,
    );
    if (!current) return { ok: false as const, error: e.staff.notFound };
    const target = await staffRank(id);
    if (target && !canActOnRole(actor, target)) return { ok: false as const, error: target.isOwner ? e.staff.ownerOnly : e.staff.outranked };
    const role = await roleRank(input.roleId);
    if (!role) return { ok: false as const, error: e.staff.pickRole };
    if (!canActOnRole(actor, role)) return { ok: false as const, error: role.isOwner ? e.staff.ownerOnly : e.staff.cannotGrant };
    const losesOwner = !role.isOwner || input.status !== "active";
    if (losesOwner && (await activeOwners(id)) === 0) return { ok: false as const, error: e.staff.lastOwner };
    if (id === actor.id && input.status !== "active") return { ok: false as const, error: e.staff.selfSuspend };
    const name = input.name.trim().slice(0, 100);
    if (name.length < 2) return { ok: false as const, error: e.staff.name };
    await run("UPDATE employees SET name = ?, employee_role_id = ?, status = ? WHERE id = ?", name, input.roleId, input.status, id);
    if (input.status !== "active" || input.roleId !== current.employee_role_id) await revokeAllEmployeeSessions(id);
    await audit(actor.id, "staff.update", `user:${id}`, input);
    return { ok: true as const };
  });
}

export async function resetStaffPassword(id: number, password: string, actor: StaffActor): Promise<{ ok: true } | Fail> {
  const e = await errorsT();
  const target = await staffRank(id);
  if (!target) return { ok: false, error: e.staff.notFound };
  // A temporary password is a way into the account: never for someone who outranks you.
  if (!canActOnRole(actor, target)) return { ok: false, error: target.isOwner ? e.staff.ownerOnly : e.staff.outranked };
  const problem = employeePasswordProblem(password, e);
  if (problem) return { ok: false, error: problem };
  const changed = (await run("UPDATE employees SET password_hash = ?, must_change_password = 1 WHERE id = ?", await hashPassword(password), id))
    .changes;
  if (!changed) return { ok: false, error: e.staff.notFound };
  await revokeAllEmployeeSessions(id);
  await audit(actor.id, "staff.password", `user:${id}`);
  return { ok: true };
}

export async function resetStaffTotp(id: number, actor: StaffActor): Promise<{ ok: true } | Fail> {
  const e = await errorsT();
  const target = await staffRank(id);
  if (!target) return { ok: false, error: e.staff.notFound };
  if (!canActOnRole(actor, target)) return { ok: false, error: target.isOwner ? e.staff.ownerOnly : e.staff.outranked };
  const changed = (await run("UPDATE employees SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL WHERE id = ?", id)).changes;
  if (!changed) return { ok: false, error: e.staff.notFound };
  await revokeAllEmployeeSessions(id);
  await audit(actor.id, "staff.2fa.reset", `user:${id}`);
  return { ok: true };
}

export const OWNER_PERMISSIONS = [ALL];

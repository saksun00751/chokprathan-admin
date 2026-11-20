// src/server/db/import-staff.ts
import "server-only";
import { q1, run, tx } from "./index";

/**
 * Copy staff accounts and roles from the member app's `users` / `staff_roles` into the admin tables,
 * keeping every id (so historical actor_id / created_by values stay correct). Safe to re-run:
 * existing rows are left alone unless `refresh` is set, which overwrites them from the source
 * (use it once, during the maintenance window, to pick up the last changes).
 * Does nothing once the member contract step has run (`staff_roles` or `users.staff_role_id` gone; `users.role` stays).
 */
export async function importStaff({ refresh = false }: { refresh?: boolean } = {}): Promise<{ roles: number; employees: number }> {
  // The contract step (member migration 9) keeps users.role but drops staff_roles and users.staff_role_id,
  // so every legacy piece the copy reads must still be there.
  const rolesTable = await q1("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_roles'");
  const roleColumn = await q1(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'",
  );
  const staffRoleColumn = await q1(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'staff_role_id'",
  );
  if (!rolesTable || !roleColumn || !staffRoleColumn) return { roles: 0, employees: 0 };
  return tx(async () => {
    await run(
      `INSERT INTO employee_roles (id, name, description, permissions, is_owner, created_at, updated_at)
       SELECT id, name, description, permissions, is_owner, created_at, updated_at FROM staff_roles
       ${refresh ? `ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), permissions = VALUES(permissions), is_owner = VALUES(is_owner), updated_at = VALUES(updated_at)` : `ON DUPLICATE KEY UPDATE employee_roles.id = employee_roles.id`}`,
    );
    await run(
      `INSERT INTO employees (id, username, password_hash, name, status, employee_role_id, totp_secret, totp_enabled, totp_last_step,
                              must_change_password, note, created_at, last_login_at, last_ip)
       SELECT id, username, password_hash, name, status, staff_role_id, totp_secret, totp_enabled, totp_last_step,
              must_change_password, staff_note, created_at, last_login_at, last_ip FROM users WHERE role = 'staff'
       ${
         refresh
           ? `ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash), name = VALUES(name), status = VALUES(status),
              employee_role_id = VALUES(employee_role_id), totp_secret = VALUES(totp_secret), totp_enabled = VALUES(totp_enabled),
              totp_last_step = VALUES(totp_last_step), must_change_password = VALUES(must_change_password), note = VALUES(note)`
           : `ON DUPLICATE KEY UPDATE employees.id = employees.id`
       }`,
    );
    const count = async (table: string) => (await q1<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0;
    return { roles: await count("employee_roles"), employees: await count("employees") };
  });
}

/**
 * Admin database tooling. Run with: npm run db -- <command> [options]
 *
 *   status                          admin schema version, employee and role counts
 *   migrate                         apply pending admin migrations (employee_* tables only)
 *   import-staff [--refresh]        copy staff accounts and roles from the member app's users / staff_roles
 *   create-owner --username U --password P [--name N]
 *                                   create the first owner account (adds the owner role if missing);
 *                                   it must change its password at first sign-in
 *
 * Reads DATABASE_URL from the environment (.env.local is loaded by the npm script). The admin app
 * never creates or changes member tables; their schema belongs to the member repo.
 */
import { ALL, DEFAULT_ROLES } from "@/domain/permissions";
import { loadDict } from "@/i18n/dictionaries";
import { closePool, json, q1, run, tx } from "@/server/db";
import { importStaff } from "@/server/db/import-staff";
import { migrate, schemaVersion } from "@/server/db/migrate";
import { audit } from "@/server/services/audit";
import { employeePasswordProblem, hashPasswordSync } from "@/server/services/employee-auth";
import { USERNAME } from "@/server/services/employees";
import { closeMongo } from "@/server/mongo";
import { ownerInput, parseArgs } from "./db-args";

const { cmd, opt, flag } = parseArgs(process.argv.slice(2));
const log = (line: string) => console.log(line);
const count = async (table: string) => (await q1<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0;

async function createOwner() {
  const e = (await loadDict("en")).errors;
  const input = ownerInput(
    { username: opt("username"), password: opt("password"), name: opt("name") },
    { username: USERNAME, passwordProblem: (p) => employeePasswordProblem(p, e) },
  );
  if (!input.ok) throw new Error(input.error);
  const { username, password, name } = input.value;
  if ((await schemaVersion()) === 0) throw new Error("the admin tables do not exist yet: run `npm run db -- migrate` first");
  const hash = hashPasswordSync(password);
  const now = Date.now();
  const result = await tx(async () => {
    if (await q1("SELECT 1 FROM employees WHERE username = ?", username)) return { created: false as const };
    let role = await q1<{ id: number }>("SELECT id FROM employee_roles WHERE is_owner = 1 ORDER BY id LIMIT 1");
    let roleCreated = false;
    if (!role) {
      const owner = DEFAULT_ROLES.find((r) => r.isOwner)!;
      const id = (
        await run(
          "INSERT INTO employee_roles (name, description, permissions, is_owner, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
          owner.name,
          owner.description,
          json.str([ALL]),
          now,
          now,
        )
      ).lastId;
      role = { id };
      roleCreated = true;
    }
    const id = (
      await run(
        `INSERT INTO employees (username, password_hash, name, employee_role_id, must_change_password, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`,
        username,
        hash,
        name,
        role.id,
        now,
      )
    ).lastId;
    await audit(null, "staff.create", `user:${id}`, { username, roleId: role.id, via: "db create-owner" }, now);
    return { created: true as const, roleCreated };
  });
  if (!result.created) throw new Error(`an employee named ${username} already exists; nothing changed`);
  if (result.roleCreated) log("created the owner role");
  log(`created owner ${username} (must change the password at first sign-in)`);
}

async function main() {
  switch (cmd) {
    case "status": {
      const version = await schemaVersion();
      log(`admin schema version: ${version}`);
      if (version > 0) {
        log(`  employees      ${await count("employees")}`);
        log(`  employee_roles ${await count("employee_roles")}`);
      }
      break;
    }
    case "migrate": {
      const n = await migrate(log);
      log(n ? `applied ${n} admin migration(s)` : "admin schema is up to date");
      break;
    }
    case "import-staff": {
      const r = await importStaff({ refresh: flag("refresh") });
      log(`employee_roles: ${r.roles}, employees: ${r.employees}${flag("refresh") ? " (refreshed from the member tables)" : ""}`);
      break;
    }
    case "create-owner": {
      await createOwner();
      break;
    }
    default:
      log("commands: status | migrate | import-staff [--refresh] | create-owner --username U --password P [--name N]");
      process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([closePool(), closeMongo()]));

#!/usr/bin/env node
/**
 * Consistency check between scripts/grants.sql and the SQL in the admin source. No database needed.
 * Usage: node scripts/check-grants.mjs [--matrix]
 *
 * Fails when
 *   (a) a table granted to chok_admin is not referenced by the admin source,
 *   (b) a table the admin source references has no grant for chok_admin (information_schema ignored),
 *   (c) a verb the source uses on a table (SELECT / INSERT / UPDATE / DELETE) is not granted for it,
 *       unless that use is listed in UNREACHABLE below (code that exists but production never calls),
 *   (d) chok_member is granted anything on an admin-owned table, or any grant uses a database-wide `lotto.*`,
 *   (e) only when the member repo is next to this one (or given with --member <path>): chok_member's
 *       tables differ from the member migrations' CREATE TABLE list (+ schema_migrations) minus admin tables.
 *
 * Test files are skipped: they run as the privileged TEST_DATABASE_URL user, never as chok_admin
 * (they reference no table the rest of the source does not).
 * The table scan is the README grep (`(FROM|JOIN|INTO|UPDATE|DELETE FROM) +name`) run over the
 * source with comment lines removed and `ON DUPLICATE KEY UPDATE <column>` not counted as a table.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = "'chok_admin'@'%'";
const MEMBER = "'chok_member'@'%'";
const isAdminOwned = (t) => t.startsWith("employee_") || t === "audit_log" || t === "schema_migrations_admin";

/** Verbs the source uses but production never reaches, so they are deliberately not granted. */
const UNREACHABLE = {
  wheel_spins: { INSERT: "activities.spinWheel is member-facing; only activities.test.ts calls it" },
  point_guesses: { INSERT: "activities.placeGuess is member-facing; only activities.test.ts calls it" },
};

/* ---------- source scan ---------- */

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const usage = new Map(); // table -> Map(verb -> Set(file))
const dropped = new Set();
const record = (table, verb, file) => {
  if (table === "information_schema") return;
  if (!usage.has(table)) usage.set(table, new Map());
  const verbs = usage.get(table);
  if (!verbs.has(verb)) verbs.set(verb, new Set());
  verbs.get(verb).add(relative(root, file));
};

// The shared package runs SQL on the app's connection too.
for (const file of [...files(join(root, "src")), ...files(join(root, "node_modules/chokprathan-core/src"))]) {
  const raw = readFileSync(file, "utf8");
  const lines = raw.split("\n");
  const code = lines.filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
  for (const l of lines) if (/^\s*(\*|\/\*|\/\/)/.test(l)) for (const m of l.matchAll(/(?:FROM|JOIN|INTO|UPDATE|DELETE FROM) +([a-z_]+)/g)) dropped.add(`${m[1]} (comment)`);
  for (const m of code.matchAll(/KEY UPDATE +([a-z_]+)/g)) dropped.add(`${m[1]} (column after ON DUPLICATE KEY UPDATE)`);

  // Tables (the README grep, minus the two noise sources above).
  for (const m of code.matchAll(/(KEY )?(?:FROM|JOIN|INTO|UPDATE|DELETE FROM) +([a-z_]+)/g)) if (!m[1]) record(m[2], "REF", file);
  // Verbs.
  for (const m of code.matchAll(/(DELETE )?(?:FROM|JOIN) +([a-z_]+)/g)) if (!m[1]) record(m[2], "SELECT", file);
  for (const m of code.matchAll(/INSERT +(?:IGNORE +)?INTO +([a-z_]+)/g)) record(m[1], "INSERT", file);
  for (const m of code.matchAll(/\bUPDATE +([a-z_]+) +(?:[a-z] +)?SET\b/g)) record(m[1], "UPDATE", file);
  for (const m of code.matchAll(/DELETE +FROM +([a-z_]+)/g)) record(m[1], "DELETE", file);
  // ON DUPLICATE KEY UPDATE updates the table of the nearest INSERT before it.
  for (const m of code.matchAll(/ON DUPLICATE KEY UPDATE/g)) {
    const before = [...code.slice(0, m.index).matchAll(/INSERT +(?:IGNORE +)?INTO +([a-z_]+)/g)].pop();
    if (before) record(before[1], "UPDATE", file);
  }
}
// insertMany("table", ...) builds its INSERT at run time.
for (const file of files(join(root, "src"))) for (const m of readFileSync(file, "utf8").matchAll(/insertMany\("([a-z_]+)"/g)) record(m[1], "INSERT", file);

/* ---------- grants.sql ---------- */

const sql = readFileSync(join(root, "scripts/grants.sql"), "utf8")
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");
const grants = { [ADMIN]: new Map(), [MEMBER]: new Map() }; // user -> table -> Set(verb)
const problems = [];
for (const m of sql.matchAll(/GRANT\s+([\s\S]+?)\s+ON\s+([\s\S]+?)\s+TO\s+('[a-z_]+'@'%')\s*;/g)) {
  const [, privText, onText, user] = m;
  if (!grants[user]) {
    problems.push(`grant to unknown user ${user}`);
    continue;
  }
  const privs = [];
  for (const p of privText.matchAll(/([A-Z]+(?: [A-Z]+)?)(?:\s*\(([^)]*)\))?/g)) {
    privs.push(p[1] === "ALL" || p[1] === "ALL PRIVILEGES" ? "ALL" : p[1]);
  }
  for (const target of onText.split(",").map((s) => s.trim())) {
    const t = /^lotto\.([a-z_*]+)$/.exec(target)?.[1];
    if (!t) {
      problems.push(`unparsed grant target "${target}"`);
      continue;
    }
    if (t === "*") problems.push(`(d) database-wide grant lotto.* to ${user}`);
    const set = grants[user].get(t) ?? new Set();
    for (const p of privs) set.add(p);
    grants[user].set(t, set);
  }
}

const admin = grants[ADMIN];
const has = (table, verb) => admin.get(table)?.has("ALL") || admin.get(table)?.has(verb);

for (const t of admin.keys()) if (!usage.has(t)) problems.push(`(a) ${t} is granted to chok_admin but the admin source never references it`);
for (const t of usage.keys()) if (!admin.has(t)) problems.push(`(b) ${t} is referenced by the admin source but has no grant for chok_admin`);
for (const [t, verbs] of usage) {
  for (const [verb, where] of verbs) {
    if (verb === "REF" || has(t, verb)) continue;
    if (UNREACHABLE[t]?.[verb]) continue;
    problems.push(`(c) ${t}: source uses ${verb} (${[...where].join(", ")}) but chok_admin has no ${verb}`);
  }
}
for (const t of grants[MEMBER].keys()) if (isAdminOwned(t)) problems.push(`(d) chok_member is granted ${t}, an admin-owned table`);

const mi = process.argv.indexOf("--member");
const memberRepo = mi >= 0 ? process.argv[mi + 1] : join(root, "../chokprathan");
const memberMigrations = join(memberRepo, "src/server/db/migrations.ts");
let memberChecked = false;
if (existsSync(memberMigrations)) {
  memberChecked = true;
  const created = new Set([...readFileSync(memberMigrations, "utf8").matchAll(/CREATE TABLE(?: IF NOT EXISTS)? +([a-z_]+)/g)].map((m) => m[1]));
  created.add("schema_migrations"); // created by the member's migrate.ts
  const expected = [...created].filter((t) => !isAdminOwned(t));
  for (const t of expected) if (!grants[MEMBER].has(t)) problems.push(`(e) member table ${t} has no grant for chok_member`);
  for (const t of grants[MEMBER].keys()) if (!created.has(t)) problems.push(`(e) chok_member is granted ${t}, which the member migrations do not create`);
}

/* ---------- report ---------- */

console.log(`admin source references ${usage.size} tables; chok_admin has grants on ${admin.size}; chok_member on ${grants[MEMBER].size}`);
console.log(memberChecked ? `chok_member list checked against ${relative(root, memberMigrations)}` : "member repo not found: chok_member list not cross-checked");
if (dropped.size) console.log(`not tables (ignored grep hits): ${[...dropped].sort().join(", ")}`);
for (const [t, verbs] of Object.entries(UNREACHABLE)) for (const [v, why] of Object.entries(verbs)) console.log(`not granted on purpose: ${v} ${t} (${why})`);
if (process.argv.includes("--matrix")) {
  console.log("\ntable                        used by source              granted to chok_admin");
  for (const t of [...usage.keys()].sort()) {
    const used = ["SELECT", "INSERT", "UPDATE", "DELETE"].filter((v) => usage.get(t).has(v)).join(",");
    console.log(`${t.padEnd(28)} ${used.padEnd(27)} ${[...(admin.get(t) ?? [])].join(",")}`);
  }
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log("grants ok");

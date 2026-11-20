/**
 * Pure helpers for scripts/db.ts: argument parsing and create-owner input checks. No database,
 * no server modules, so scripts/db-args.test.ts runs in a plain `npm test`.
 */

/** Same helpers as the member repo's scripts/db.ts: `opt("x")` reads `--x value`, `flag("x")` tests `--x`. */
export function parseArgs(argv: readonly string[]) {
  const args = [...argv];
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    const value = i >= 0 ? args[i + 1] : undefined;
    return value === undefined || value.startsWith("--") ? undefined : value;
  };
  const flag = (name: string) => args.includes(`--${name}`);
  return { cmd: args[0], opt, flag };
}

export interface OwnerInput {
  username: string;
  password: string;
  name: string;
}

export interface OwnerRules {
  /** The employee username pattern (services/employees.ts USERNAME). */
  username: RegExp;
  /** The employee password policy (employeePasswordProblem bound to a dictionary). */
  passwordProblem: (password: string) => string | null;
}

/** Longest password the app accepts (the /security change-password action refuses longer ones). */
export const PASSWORD_MAX = 64;
export const DEFAULT_OWNER_NAME = "เจ้าของระบบ";

/**
 * Check and normalise create-owner's options with the same rules the app applies when an owner
 * creates an employee (createStaff): lower-case username, name 2–100 characters, the employee
 * password policy, at most PASSWORD_MAX characters.
 */
export function ownerInput(
  raw: { username?: string; password?: string; name?: string },
  rules: OwnerRules,
): { ok: true; value: OwnerInput } | { ok: false; error: string } {
  if (!raw.username) return { ok: false, error: "--username is required" };
  if (!raw.password) return { ok: false, error: "--password is required" };
  const username = raw.username.trim().toLowerCase();
  if (!rules.username.test(username)) return { ok: false, error: `--username must match ${rules.username}` };
  const name = (raw.name ?? DEFAULT_OWNER_NAME).trim();
  if (name.length < 2 || name.length > 100) return { ok: false, error: "--name must be 2 to 100 characters" };
  const problem = rules.passwordProblem(raw.password);
  if (problem) return { ok: false, error: `--password: ${problem}` };
  if (raw.password.length > PASSWORD_MAX) return { ok: false, error: `--password must be at most ${PASSWORD_MAX} characters` };
  return { ok: true, value: { username, password: raw.password, name } };
}

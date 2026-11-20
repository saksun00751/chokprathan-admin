// src/server/services/employee-auth.ts
import "server-only";
import { createHash, randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { fmt } from "@/i18n/format";
import { errorsT } from "@/i18n/server";
import type { Dict } from "@/i18n/dictionaries";
import { hasPermission, type Permission } from "@/domain/permissions";
import { endedParam, type SessionEnd } from "@/domain/sessions";
import { DAY, HOUR, MINUTE } from "@/domain/time";
import { json, q, q1, run, tx } from "@/server/db";
import { matchTotp } from "@/server/totp";

/* ---- password hashing: copied unchanged from the member app so existing hashes keep working ---- */
const SCRYPT: ScryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;
function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(password, salt, KEYLEN, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export function hashPasswordSync(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEYLEN, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) {
    await scrypt(password, randomBytes(16));
    return false;
  }
  const expected = Buffer.from(keyB64, "base64url");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64url"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/* ---- cookie and lifetimes ---- */
export const EMPLOYEE_COOKIE_BASE = "cpa_session";
/** `__Host-` pins the cookie to this exact host over HTTPS (no Domain, Path=/, Secure). */
export const EMPLOYEE_COOKIE = process.env.NODE_ENV === "production" ? `__Host-${EMPLOYEE_COOKIE_BASE}` : EMPLOYEE_COOKIE_BASE;
export const EMPLOYEE_SESSION_TTL = 12 * HOUR;
export const EMPLOYEE_IDLE_TTL = 2 * HOUR;
const TOUCH_EVERY = 5 * MINUTE;
const END_KEPT = 35 * DAY;

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}
export type StoredEnd = Exclude<SessionEnd, "expired">;

/* ---- sessions ---- */
async function endSessions(where: string, args: unknown[], reason: StoredEnd, now: number, byIp: string | null = null): Promise<number> {
  await run(
    `INSERT IGNORE INTO employee_session_ends (token_hash, employee_id, reason, ended_at, by_ip) SELECT token_hash, employee_id, ?, ?, ? FROM employee_sessions WHERE ${where}`,
    reason,
    now,
    byIp,
    ...args,
  );
  return (await run(`DELETE FROM employee_sessions WHERE ${where}`, ...args)).changes;
}

/** One live session per employee: every other session ends here ("replaced"). The row lock makes two sign-ins take turns. */
export async function createEmployeeSession(employeeId: number, client: ClientInfo, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + EMPLOYEE_SESSION_TTL;
  const replaced = await tx(async () => {
    await q1("SELECT id FROM employees WHERE id = ? FOR UPDATE", employeeId);
    const ended = await endSessions("employee_id = ?", [employeeId], "replaced", now, client.ip);
    await run(
      "INSERT INTO employee_sessions (token_hash, employee_id, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)",
      sha256(token),
      employeeId,
      now,
      expiresAt,
      now,
      client.ip,
      client.userAgent?.slice(0, 255) ?? null,
    );
    await run("UPDATE employees SET last_login_at = ?, last_ip = ? WHERE id = ?", now, client.ip, employeeId);
    return ended;
  });
  return { token, expiresAt, replaced };
}

export interface Employee {
  id: number;
  username: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
  permissions: string[];
  isOwner: boolean;
  totpEnabled: boolean;
  mustChangePassword: boolean;
}

interface EmployeeRow {
  id: number;
  username: string;
  name: string;
  status: "active" | "suspended";
  employee_role_id: number | null;
  totp_enabled: number;
  must_change_password: number;
  role_name: string | null;
  role_permissions: string | null;
  role_is_owner: number | null;
  last_seen_at: number;
}

export const can = (employee: Pick<Employee, "permissions"> | null | undefined, need: Permission) =>
  !!employee && hasPermission(employee.permissions, need);

export async function employeeFromToken(token: string, now = Date.now()): Promise<Employee | null> {
  if (!token || token.length > 100) return null;
  const hash = sha256(token);
  const row = await q1<EmployeeRow>(
    `SELECT e.id, e.username, e.name, e.status, e.employee_role_id, e.totp_enabled, e.must_change_password, s.last_seen_at,
            r.name AS role_name, r.permissions AS role_permissions, r.is_owner AS role_is_owner
     FROM employee_sessions s JOIN employees e ON e.id = s.employee_id LEFT JOIN employee_roles r ON r.id = e.employee_role_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    hash,
    now,
  );
  if (!row || row.status !== "active") return null;
  if (now - row.last_seen_at > EMPLOYEE_IDLE_TTL) {
    await endSessions("token_hash = ?", [hash], "idle", now);
    return null;
  }
  if (now - row.last_seen_at > TOUCH_EVERY) await run("UPDATE employee_sessions SET last_seen_at = ? WHERE token_hash = ?", now, hash);
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    roleId: row.employee_role_id,
    roleName: row.role_name,
    permissions: json.parse<string[]>(row.role_permissions, []),
    isOwner: row.role_is_owner === 1,
    totpEnabled: row.totp_enabled === 1,
    mustChangePassword: row.must_change_password === 1,
  };
}

export async function revokeEmployeeSession(token: string) {
  await run("DELETE FROM employee_sessions WHERE token_hash = ?", sha256(token));
}

export async function revokeAllEmployeeSessions(employeeId: number, reason: StoredEnd = "revoked", now = Date.now()) {
  await endSessions("employee_id = ?", [employeeId], reason, now);
}

export async function sessionEndOf(token: string): Promise<{ reason: StoredEnd; at: number; ip: string | null } | null> {
  if (!token || token.length > 100) return null;
  const row = await q1<{ reason: string; ended_at: number; by_ip: string | null }>(
    "SELECT reason, ended_at, by_ip FROM employee_session_ends WHERE token_hash = ?",
    sha256(token),
  );
  const reason = endedParam(row?.reason);
  return row && reason && reason !== "expired" ? { reason, at: row.ended_at, ip: row.by_ip } : null;
}

export type SessionState = { state: "active" } | { state: "ended"; reason: SessionEnd; at: number | null; ip: string | null };

/** Read-only liveness check for the browser's periodic poll (never counts as activity). */
export async function sessionState(token: string, now = Date.now()): Promise<SessionState> {
  const gone = { state: "ended", reason: "expired", at: null, ip: null } as const;
  if (!token || token.length > 100) return gone;
  const hash = sha256(token);
  const row = await q1<{ status: string; expires_at: number; last_seen_at: number }>(
    "SELECT e.status, s.expires_at, s.last_seen_at FROM employee_sessions s JOIN employees e ON e.id = s.employee_id WHERE s.token_hash = ?",
    hash,
  );
  if (row) {
    if (row.status !== "active") return { ...gone, reason: "revoked" };
    if (row.expires_at <= now) return gone;
    if (now - row.last_seen_at > EMPLOYEE_IDLE_TTL) {
      await endSessions("token_hash = ?", [hash], "idle", now);
      return { ...gone, reason: "idle", at: now };
    }
    return { state: "active" };
  }
  const end = await sessionEndOf(token);
  return end ? { state: "ended", ...end } : gone;
}

export async function pruneEmployeeSessions(now = Date.now()) {
  await run("DELETE FROM employee_sessions WHERE expires_at < ?", now);
  await run("DELETE FROM employee_session_ends WHERE ended_at < ?", now - END_KEPT);
  await run("DELETE FROM employee_login_challenges WHERE expires_at < ?", now);
  await run("DELETE FROM employee_login_attempts WHERE at < ?", now - DAY);
}

/* ---- sign-in audit trail ---- */
export type AuthEvent =
  | "login" | "login_failed" | "login_locked" | "2fa_failed" | "logout"
  | "password_changed" | "password_reset" | "2fa_enabled" | "2fa_disabled" | "session_replaced";

export async function authLog(event: AuthEvent, employeeId: number | null, identifier: string | null, client: ClientInfo, now = Date.now()) {
  await run(
    "INSERT INTO employee_auth_log (employee_id, identifier, event, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    employeeId,
    identifier,
    event,
    client.ip,
    client.userAgent?.slice(0, 255) ?? null,
    now,
  );
}

/* ---- login ---- */
const LOCK_WINDOW = 15 * MINUTE;
const MAX_FAILURES = 5;
const MAX_IP_FAILURES = 30;

async function lockRemaining(identifier: string, ip: string | null, now: number): Promise<number> {
  const recent = await q<{ at: number }>("SELECT at FROM employee_login_attempts WHERE identifier = ? AND at > ? ORDER BY at", identifier, now - LOCK_WINDOW);
  if (recent.length >= MAX_FAILURES) return recent[recent.length - MAX_FAILURES].at + LOCK_WINDOW - now;
  if (ip) {
    const fromIp = await q1<{ n: number; first: number | null }>("SELECT COUNT(*) AS n, MIN(at) AS first FROM employee_login_attempts WHERE ip = ? AND at > ?", ip, now - LOCK_WINDOW);
    if ((fromIp?.n ?? 0) >= MAX_IP_FAILURES) return (fromIp!.first ?? now) + LOCK_WINDOW - now;
  }
  return 0;
}

export type LoginCheck = { ok: true; employeeId: number; needsTotp: boolean } | { ok: false; error: string };

/** An unknown username and a wrong password give the same error and count the same failed attempt. */
export async function checkEmployeeLogin(identifier: string, password: string, client: ClientInfo, now = Date.now()): Promise<LoginCheck> {
  const id = identifier.trim().slice(0, 100);
  const locked = await lockRemaining(id, client.ip, now);
  const e = await errorsT();
  if (locked > 0) {
    await authLog("login_locked", null, id, client, now);
    return { ok: false, error: fmt(e.auth.locked, { n: Math.ceil(locked / MINUTE) }) };
  }
  const user = await q1<{ id: number; status: string; password_hash: string; totp_enabled: number }>(
    "SELECT id, status, password_hash, totp_enabled FROM employees WHERE username = ?",
    id,
  );
  const valid = await verifyPassword(password, user?.password_hash ?? "");
  if (!user || !valid) {
    await run("INSERT INTO employee_login_attempts (identifier, ip, at) VALUES (?, ?, ?)", id, client.ip, now);
    await authLog("login_failed", user?.id ?? null, id, client, now);
    return { ok: false, error: e.auth.badCredentials };
  }
  if (user.status !== "active") return { ok: false, error: e.auth.suspended };
  await run("DELETE FROM employee_login_attempts WHERE identifier = ?", id);
  return { ok: true, employeeId: user.id, needsTotp: user.totp_enabled === 1 };
}

/* ---- two-step sign-in ---- */
const CHALLENGE_TTL = 5 * MINUTE;

export async function createLoginChallenge(employeeId: number, next: string, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  await run(
    "INSERT INTO employee_login_challenges (token_hash, employee_id, next_path, attempts, expires_at) VALUES (?, ?, ?, 0, ?)",
    sha256(token),
    employeeId,
    next.slice(0, 200),
    now + CHALLENGE_TTL,
  );
  return { token, expiresAt: now + CHALLENGE_TTL };
}

export async function completeLoginChallenge(
  token: string,
  code: string,
  client: ClientInfo,
  now = Date.now(),
): Promise<{ ok: true; employeeId: number; next: string } | { ok: false; error: string; expired?: boolean }> {
  const hash = sha256(token);
  const e = await errorsT();
  return tx(async () => {
    const c = await q1<{ employee_id: number; next_path: string; attempts: number; expires_at: number }>(
      "SELECT employee_id, next_path, attempts, expires_at FROM employee_login_challenges WHERE token_hash = ? FOR UPDATE",
      hash,
    );
    if (!c || c.expires_at < now) return { ok: false as const, error: e.auth.challengeExpired, expired: true };
    if (c.attempts >= 5) {
      await run("DELETE FROM employee_login_challenges WHERE token_hash = ?", hash);
      return { ok: false as const, error: e.auth.totpTooMany, expired: true };
    }
    const user = await q1<{ totp_secret: string | null; totp_last_step: number | null; status: string }>(
      "SELECT totp_secret, totp_last_step, status FROM employees WHERE id = ? FOR UPDATE",
      c.employee_id,
    );
    const step = user?.totp_secret ? matchTotp(user.totp_secret, code, now, user.totp_last_step) : null;
    if (!user || user.status !== "active" || step === null) {
      await run("UPDATE employee_login_challenges SET attempts = attempts + 1 WHERE token_hash = ?", hash);
      await authLog("2fa_failed", c.employee_id, null, client, now);
      return { ok: false as const, error: e.auth.totpWrong };
    }
    await run("UPDATE employees SET totp_last_step = ? WHERE id = ?", step, c.employee_id);
    await run("DELETE FROM employee_login_challenges WHERE token_hash = ?", hash);
    return { ok: true as const, employeeId: c.employee_id, next: c.next_path };
  });
}

export async function enableTotp(employeeId: number, secret: string, code: string, now = Date.now()): Promise<boolean> {
  const step = matchTotp(secret, code, now);
  if (step === null) return false;
  await run("UPDATE employees SET totp_secret = ?, totp_enabled = 1, totp_last_step = ? WHERE id = ?", secret, step, employeeId);
  return true;
}

export async function disableTotp(employeeId: number) {
  await run("UPDATE employees SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL WHERE id = ?", employeeId);
}

/** A password policy employee accounts must meet. */
export function employeePasswordProblem(password: string, e: Pick<Dict["errors"], "auth">): string | null {
  if (password.length < 10) return e.auth.staffShort;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return e.auth.staffMix;
  return null;
}

/**
 * Decides whether a test run may empty EVERY table of the database (member tables too), not just
 * the admin ones. Pure: no DB access. Allowed only when all of these hold:
 *   - ALLOW_DB_RESET=yes-destroy-data
 *   - TEST_TRUNCATE_ALL=yes-wipe-every-table
 *   - the database named in the URL ends with `_test`
 * Anything else (including a malformed URL) is refused.
 */
export type ResetDecision = { ok: true } | { ok: false; reason: string };

export const TRUNCATE_ALL_FLAG = "yes-wipe-every-table";

export function canTruncateAll(databaseUrl: string | undefined, env: Record<string, string | undefined>): ResetDecision {
  if (env.ALLOW_DB_RESET !== "yes-destroy-data") return { ok: false, reason: "ALLOW_DB_RESET is not yes-destroy-data" };
  if (env.TEST_TRUNCATE_ALL !== TRUNCATE_ALL_FLAG) return { ok: false, reason: `TEST_TRUNCATE_ALL is not ${TRUNCATE_ALL_FLAG}` };
  if (!databaseUrl) return { ok: false, reason: "DATABASE_URL is not set" };
  let name: string;
  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") return { ok: false, reason: "DATABASE_URL is not a mysql:// URL" };
    name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a valid URL" };
  }
  if (!/^[A-Za-z0-9_$]+_test$/.test(name)) return { ok: false, reason: `database ${name || "(none)"} does not end with _test` };
  return { ok: true };
}

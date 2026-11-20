/**
 * Decides whether a test may wipe every table of a database (TEST_TRUNCATE_ALL=1). Pure: no DB.
 * Allowed only with ALLOW_DB_RESET=yes-destroy-data and a DATABASE_URL on this machine
 * (127.0.0.1 or localhost), so a remote server can never be emptied by a test run.
 */
export type ResetDecision = { ok: true } | { ok: false; reason: string };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function truncateAllAllowed(databaseUrl: string | undefined, allowReset: string | undefined): ResetDecision {
  if (allowReset !== "yes-destroy-data") return { ok: false, reason: "ALLOW_DB_RESET is not yes-destroy-data" };
  if (!databaseUrl) return { ok: false, reason: "DATABASE_URL is not set" };
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a valid URL" };
  }
  if (!LOCAL_HOSTS.has(host.toLowerCase())) return { ok: false, reason: `host ${host || "(empty)"} is not 127.0.0.1 or localhost` };
  return { ok: true };
}

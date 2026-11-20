import type { Dict } from "@/i18n/dictionaries";
import { fmt } from "@/i18n/format";
import "server-only";
import { q1, run } from "@/server/db";

export type Limit = { ok: true } | { ok: false; retryAfterMs: number };

/**
 * Fixed-window counter shared by every app instance (stored in MariaDB).
 * For security limits: logins, OTP requests, registrations, voucher guesses.
 */
export async function limitShared(bucket: string, max: number, windowMs: number, now = Date.now()): Promise<Limit> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = bucket.slice(0, 120);
  await run(
    "INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1",
    key,
    windowStart,
  );
  const row = await q1<{ hits: number }>("SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?", key, windowStart);
  return (row?.hits ?? 0) <= max ? { ok: true } : { ok: false, retryAfterMs: windowStart + windowMs - now };
}

type Local = Map<string, { start: number; hits: number }>;
const local = ((globalThis as unknown as { __chokprathanRate?: Local }).__chokprathanRate ??= new Map());

/**
 * In-process fixed-window counter for high-frequency paths (bets, quotes, polling).
 * Costs no query; each instance enforces its own share.
 */
export function limitLocal(bucket: string, max: number, windowMs: number, now = Date.now()): Limit {
  const start = Math.floor(now / windowMs) * windowMs;
  const e = local.get(bucket);
  if (!e || e.start !== start) {
    local.set(bucket, { start, hits: 1 });
    if (local.size > 50_000) for (const [k, v] of local) if (v.start < start) local.delete(k);
    return { ok: true };
  }
  e.hits++;
  return e.hits <= max ? { ok: true } : { ok: false, retryAfterMs: start + windowMs - now };
}

/** "30 วินาที" / "2 minutes": how long until the limit lifts, in the request's language. */
export function retryText(ms: number, e: Pick<Dict["errors"], "retry">): string {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? fmt(e.retry.seconds, { n: s }) : fmt(e.retry.minutes, { n: Math.ceil(s / 60) });
}

export async function pruneRateLimits(now = Date.now()) {
  await run("DELETE FROM rate_limits WHERE window_start < ?", now - 2 * 86_400_000);
}

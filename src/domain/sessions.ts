/**
 * One live session per account: signing in on a new device ends the session on the old one. These
 * are the reasons a device can lose its session, shown to whoever is still looking at it.
 * - replaced: the account signed in somewhere else
 * - revoked: ended for security (password, status, or 2-step changes, suspension)
 * - idle: a staff session left unused too long
 * - expired: past its lifetime, or nothing is known about it
 */
export const SESSION_ENDS = ["replaced", "revoked", "idle", "expired"] as const;
export type SessionEnd = (typeof SESSION_ENDS)[number];

/** The `?ended=` value on a sign-in page (first one when repeated), or null for anything else. */
export function endedParam(value: unknown): SessionEnd | null {
  const v = Array.isArray(value) ? value[0] : value;
  return (SESSION_ENDS as readonly unknown[]).includes(v) ? (v as SessionEnd) : null;
}

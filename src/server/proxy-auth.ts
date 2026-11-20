// src/server/proxy-auth.ts
import "server-only";
import { createHash } from "node:crypto";
import { endedParam, type SessionEnd } from "@/domain/sessions";
import { memo } from "@/server/cache";
import { q1 } from "@/server/db";

export type SessionGate = { ok: true } | { ok: false; ended: SessionEnd | null };

/** Paths reachable without a session (the sign-in page). */
export const isPublicPath = (logical: string) => logical === "/login" || logical.startsWith("/login/");

/** Is the employee session behind `token` alive? Cached 5 s per token; pages and actions still check permissions themselves. */
export async function sessionGate(token: string): Promise<SessionGate> {
  if (!token || token.length > 100) return { ok: false, ended: null };
  const hash = createHash("sha256").update(token).digest("hex");
  return memo(`proxy:${hash}`, 5_000, async (): Promise<SessionGate> => {
    const row = await q1<{ status: string }>(
      "SELECT e.status FROM employee_sessions s JOIN employees e ON e.id = s.employee_id WHERE s.token_hash = ? AND s.expires_at > ?",
      hash,
      Date.now(),
    );
    if (row && row.status === "active") return { ok: true };
    const end = await q1<{ reason: string }>("SELECT reason FROM employee_session_ends WHERE token_hash = ?", hash);
    return { ok: false, ended: endedParam(end?.reason) };
  });
}

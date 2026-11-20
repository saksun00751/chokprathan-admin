import "server-only";
import { run, tolerateMissingTable } from "@/server/db";

/** Why a member session ended (same values the member app writes to `session_ends`). */
export type MemberSessionEnd = "revoked" | "replaced" | "idle";

/**
 * Sign a member out everywhere. The `sessions` and `session_ends` tables belong to the member app;
 * admin only ends sessions there when it blocks or changes a member, so the member's next request
 * is refused. Mirrors the member app's endSessions for `user_id = ?`.
 */
export async function revokeAllMemberSessions(userId: number, reason: MemberSessionEnd = "revoked", now = Date.now()) {
  await tolerateMissingTable(
    () =>
      run(
        "INSERT IGNORE INTO session_ends (token_hash, user_id, reason, ended_at, by_ip) SELECT token_hash, user_id, ?, ?, ? FROM sessions WHERE user_id = ?",
        reason,
        now,
        null,
        userId,
      ),
    undefined,
  );
  await run("DELETE FROM sessions WHERE user_id = ?", userId);
}

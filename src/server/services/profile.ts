import "server-only";
import { avatarOf, isAvatar, type Avatar } from "@/domain/avatar";
import { q, q1, run, tolerateMissingColumn } from "@/server/db";

/*
 * The avatar column comes with admin migration 2. It is read on its own, not with the session, so
 * signing in keeps working on a database that has not been migrated yet.
 */

type Stored = { ready: boolean; avatar: Avatar | null };

/** `ready` is false until the migration has run. */
export async function readAvatar(employeeId: number): Promise<Stored> {
  return tolerateMissingColumn<Stored>(
    async () => {
      const row = await q1<{ avatar: string | null }>("SELECT avatar FROM employees WHERE id = ?", employeeId);
      return { ready: true, avatar: avatarOf(row?.avatar) };
    },
    { ready: false, avatar: null },
  );
}

/** Every employee who picked one; empty before the migration has run. */
export async function readAvatars(): Promise<Map<number, Avatar>> {
  return tolerateMissingColumn<Map<number, Avatar>>(async () => {
    const rows = await q<{ id: number; avatar: string }>("SELECT id, avatar FROM employees WHERE avatar IS NOT NULL");
    return new Map(rows.flatMap((r) => (isAvatar(r.avatar) ? [[r.id, r.avatar] as const] : [])));
  }, new Map());
}

/** False when the database has not been migrated yet. */
export async function saveAvatar(employeeId: number, avatar: Avatar | null): Promise<boolean> {
  return tolerateMissingColumn<boolean>(async () => {
    await run("UPDATE employees SET avatar = ? WHERE id = ?", avatar, employeeId);
    return true;
  }, false);
}

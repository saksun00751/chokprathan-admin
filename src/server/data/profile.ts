import "server-only";
import { io } from "next/cache";
import { readAvatar } from "@/server/services/profile";
import { requireEmployee } from "@/server/session";

/** The signed-in employee's own profile (/profile). */
export async function getProfile() {
  const viewer = await requireEmployee();
  await io();
  return { username: viewer.username, name: viewer.name, roleName: viewer.roleName, ...(await readAvatar(viewer.id)) };
}

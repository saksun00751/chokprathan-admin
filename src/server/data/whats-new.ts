import "server-only";
import { byAreaAndKind, RELEASES } from "@/domain/whats-new";
import { can } from "@/server/services/employee-auth";
import { requireEmployee } from "@/server/session";

/** The releases, for any signed-in employee, linking only to pages they may open. */
export async function getWhatsNew() {
  const viewer = await requireEmployee();
  return RELEASES.map((r) => ({
    day: r.day,
    areas: byAreaAndKind(r.items.map(({ link, ...i }) => ({ ...i, href: link && can(viewer, link.need) ? link.href : null }))),
  }));
}

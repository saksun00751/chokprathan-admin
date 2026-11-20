import { cookies } from "next/headers";
import { connection } from "next/server";
import { clientInfo } from "@/server/request";
import { limitLocal } from "@/server/services/ratelimit";
import { EMPLOYEE_COOKIE, sessionState } from "@/server/services/employee-auth";
import { expiredSessionCookie } from "@/server/session";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Is this browser's employee session still alive? Polled by SessionWatch so a device that lost its
 * session (the account signed in elsewhere, a password or status change, an idle session) says so
 * within 30 seconds. Read only: polling never keeps a session alive. A dead cookie is cleared on the
 * way out, and the IP of the sign-in that replaced it is shown.
 */
export async function GET() {
  await connection();
  const { ip } = await clientInfo();
  if (!limitLocal(`session-check:${ip ?? "?"}`, 600, 60_000).ok)
    return Response.json({ state: "unknown" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "30" } });

  const jar = await cookies();
  const token = jar.get(EMPLOYEE_COOKIE)?.value;
  if (!token) return Response.json({ state: "none" }, { headers: NO_STORE });
  const s = await sessionState(token);
  if (s.state === "active") return Response.json({ state: "active" }, { headers: NO_STORE });
  jar.set(expiredSessionCookie());
  return Response.json({ state: "ended", reason: s.reason, at: s.at, ip: s.ip }, { headers: NO_STORE });
}

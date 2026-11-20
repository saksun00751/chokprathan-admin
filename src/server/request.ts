import "server-only";
import { headers } from "next/headers";
import type { ClientInfo } from "@/server/services/employee-auth";

const IP = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * The caller's IP and user agent. Behind a reverse proxy (TRUST_PROXY=1) the proxy sets
 * X-Real-IP to the socket address; otherwise the last X-Forwarded-For hop is used, which Next.js
 * fills from the socket when the client sends none.
 */
export async function clientInfo(): Promise<ClientInfo> {
  const h = await headers();
  const real = process.env.TRUST_PROXY === "1" ? h.get("x-real-ip")?.trim() : undefined;
  const forwarded = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  const ip = [real, forwarded].find((v) => v && IP.test(v)) ?? null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 255) ?? null };
}

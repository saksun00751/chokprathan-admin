// src/server/session.ts
import "server-only";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Permission } from "@/domain/permissions";
import { can, EMPLOYEE_COOKIE, sessionEndOf, employeeFromToken, type Employee } from "@/server/services/employee-auth";
import { getSetting } from "@/server/services/settings";

/** Reads cookies: callers must sit inside <Suspense> (Cache Components). */
export const getEmployee = cache(async (): Promise<Employee | null> => {
  const token = (await cookies()).get(EMPLOYEE_COOKIE)?.value;
  if (!token) return null;
  await io();
  return employeeFromToken(token);
});

export async function loginUrl(next: string): Promise<string> {
  const token = (await cookies()).get(EMPLOYEE_COOKIE)?.value;
  const end = token ? await sessionEndOf(token) : null;
  return `/login?next=${encodeURIComponent(next)}${end ? `&ended=${end.reason}` : ""}`;
}

/** Employees who must still set up 2-step sign-in (the owner can require it for everyone). */
export async function needsTotpSetup(e: Pick<Employee, "totpEnabled">): Promise<boolean> {
  return !e.totpEnabled && (await getSetting("site")).staffTotpRequired;
}

export async function requireEmployee(need?: Permission): Promise<Employee> {
  const e = await getEmployee();
  if (!e) redirect(await loginUrl("/"));
  if (e.mustChangePassword || (await needsTotpSetup(e))) redirect("/security");
  if (need && !can(e, need)) redirect(`/denied?need=${encodeURIComponent(need)}`);
  return e;
}

/** For Server Actions: the employee when allowed, otherwise null (never redirects). */
export async function employeeFor(need: Permission): Promise<Employee | null> {
  const e = await getEmployee();
  if (!e || e.mustChangePassword || (await needsTotpSetup(e))) return null;
  return can(e, need) ? e : null;
}

export async function setSessionCookie(token: string, expiresAt: number) {
  (await cookies()).set(EMPLOYEE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(expiresAt) });
}

export const expiredSessionCookie = () => ({
  name: EMPLOYEE_COOKIE,
  value: "",
  expires: new Date(0),
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
});

export async function clearSessionCookie() {
  (await cookies()).set(expiredSessionCookie());
}

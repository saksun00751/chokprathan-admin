"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fmt } from "@/i18n/format";
import { errorsT } from "@/i18n/server";
import { clientInfo } from "@/server/request";
import {
  authLog,
  checkEmployeeLogin,
  completeLoginChallenge,
  createEmployeeSession,
  createLoginChallenge,
  EMPLOYEE_COOKIE,
  employeeFromToken,
  revokeEmployeeSession,
} from "@/server/services/employee-auth";
import { limitShared, retryText } from "@/server/services/ratelimit";
import { clearSessionCookie, needsTotpSetup, setSessionCookie } from "@/server/session";
import { safeNext } from "./safe-next";

/** Holds the pending two-step sign-in between the password and the code (not the member site's cp_2fa). */
const CHALLENGE_COOKIE = process.env.NODE_ENV === "production" ? "__Host-cpa_2fa" : "cpa_2fa";

export type LoginState = { error?: string; identifier?: string; challenge?: boolean };
export type TotpState = { error?: string; expired?: boolean };

/**
 * Signs the employee in on this device (ending their session anywhere else) and goes on. An account
 * that must still change its password or set up 2-step sign-in goes to /security first, as every
 * back-office page would send it there anyway (see requireEmployee).
 */
async function startSession(employeeId: number, next: string) {
  const client = await clientInfo();
  const { token, expiresAt, replaced } = await createEmployeeSession(employeeId, client);
  await setSessionCookie(token, expiresAt);
  await authLog("login", employeeId, null, client);
  // One session per employee: this sign-in just signed another device out.
  if (replaced > 0) await authLog("session_replaced", employeeId, null, client);
  const employee = await employeeFromToken(token);
  if (employee && (employee.mustChangePassword || (await needsTotpSetup(employee)))) redirect("/security");
  redirect(safeNext(next));
}

/** Employee sign-in (/login), with the authenticator step when the account has it turned on. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "")
    .trim()
    .slice(0, 100);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const next = safeNext(formData.get("next"));
  const e = await errorsT();
  if (!identifier || !password) return { error: e.auth.loginMissing, identifier };

  const client = await clientInfo();
  const burst = await limitShared(`admin-login:ip:${client.ip ?? "?"}`, 20, 10 * 60_000);
  if (!burst.ok) return { error: fmt(e.auth.loginBurst, { wait: retryText(burst.retryAfterMs, e) }), identifier };

  // An unknown username and a wrong password give the same error (checkEmployeeLogin).
  const result = await checkEmployeeLogin(identifier, password, client);
  if (!result.ok) return { error: result.error, identifier };
  if (result.needsTotp) {
    const { token, expiresAt } = await createLoginChallenge(result.employeeId, next);
    (await cookies()).set(CHALLENGE_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(expiresAt),
    });
    return { challenge: true, identifier };
  }
  await startSession(result.employeeId, next);
  return {};
}

/** Second step: the 6-digit code from the authenticator app. */
export async function verifyLoginCodeAction(_prev: TotpState, formData: FormData): Promise<TotpState> {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  if (!token) return { error: (await errorsT()).auth.challengeExpired, expired: true };
  const client = await clientInfo();
  const r = await completeLoginChallenge(token, String(formData.get("code") ?? ""), client);
  if (!r.ok) {
    if (r.expired) jar.delete({ name: CHALLENGE_COOKIE, path: "/", secure: process.env.NODE_ENV === "production" });
    return { error: r.error, expired: r.expired };
  }
  jar.delete({ name: CHALLENGE_COOKIE, path: "/", secure: process.env.NODE_ENV === "production" });
  await startSession(r.employeeId, r.next);
  return {};
}

/** Sign-out: ends this device's session and goes back to the sign-in page. */
export async function logoutAction() {
  const token = (await cookies()).get(EMPLOYEE_COOKIE)?.value;
  if (token) {
    const employee = await employeeFromToken(token);
    await revokeEmployeeSession(token);
    if (employee) await authLog("logout", employee.id, null, await clientInfo());
  }
  await clearSessionCookie();
  redirect("/login");
}

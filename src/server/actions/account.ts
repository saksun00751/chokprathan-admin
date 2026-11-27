"use server";

import { refresh } from "next/cache";
import QRCode from "qrcode";
import { BRAND } from "@/config/brand";
import { isAvatar } from "@/domain/avatar";
import { fmt } from "@/i18n/format";
import { errorsT } from "@/i18n/server";
import type { ActionResult } from "@/lib/action";
import { q1 } from "@/server/db";
import { clientInfo } from "@/server/request";
import {
  authLog,
  changeEmployeePassword,
  disableTotp,
  employeePasswordProblem,
  enableTotp,
  revokeAllEmployeeSessions,
  verifyPassword,
} from "@/server/services/employee-auth";
import { limitLocal, limitShared, retryText } from "@/server/services/ratelimit";
import { saveAvatar } from "@/server/services/profile";
import { getSetting } from "@/server/services/settings";
import { getEmployee, needsTotpSetup } from "@/server/session";
import { newTotpSecret, otpauthUri } from "@/server/totp";

/*
 * The signed-in employee's own settings: security (/security) and profile (/profile). These use
 * getEmployee(), not employeeFor(): an employee who must change their password or set up 2-step
 * sign-in has to be able to do exactly that (and nothing else, so the profile action refuses them).
 */

/** Employees change their password on /security, with the employee password rules. */
export async function changeStaffPasswordAction(current: string, next: string, confirm: string): Promise<ActionResult> {
  const e = await errorsT();
  const viewer = await getEmployee();
  if (!viewer) return { ok: false, error: e.generic.loginFirst };
  if (typeof next !== "string" || typeof current !== "string") return { ok: false, error: e.generic.invalid };
  const limit = await limitShared(`admin-pwchange:${viewer.id}`, 10, 60 * 60_000);
  if (!limit.ok) return { ok: false, error: fmt(e.account.tooOften, { wait: retryText(limit.retryAfterMs, e) }) };
  const problem = employeePasswordProblem(next, e);
  if (problem) return { ok: false, error: problem, fieldErrors: { next: problem } };
  if (next.length > 64) return { ok: false, error: e.account.tooLong, fieldErrors: { next: e.account.tooLong } };
  if (next !== confirm) return { ok: false, error: e.account.newMismatch, fieldErrors: { confirm: e.account.newMismatch } };
  const r = await changeEmployeePassword(viewer.id, current, next);
  if (!r.ok) return { ok: false, error: r.error, fieldErrors: { current: r.error } };
  await authLog("password_changed", viewer.id, null, await clientInfo());
  refresh();
  return { ok: true, message: e.account.changed };
}

/** Step 1 of turning on two-step sign-in: a fresh secret the employee adds to their app. */
export async function startTotpSetupAction(): Promise<ActionResult<{ secret: string; qr: string }>> {
  const e = await errorsT();
  const viewer = await getEmployee();
  if (!viewer) return { ok: false, error: e.generic.staffOnly };
  const secret = newTotpSecret();
  const uri = otpauthUri(secret, viewer.username, BRAND.nameLatin);
  const qr = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 220 });
  return { ok: true, data: { secret, qr } };
}

/** Step 2: the code from the app proves the secret was saved; only then is it stored. */
export async function confirmTotpSetupAction(secret: string, code: string): Promise<ActionResult> {
  const e = await errorsT();
  const viewer = await getEmployee();
  if (!viewer) return { ok: false, error: e.generic.staffOnly };
  if (typeof secret !== "string" || !/^[A-Z2-7]{32}$/.test(secret)) return { ok: false, error: e.account.totpRestart };
  if (!(await enableTotp(viewer.id, secret, String(code ?? "")))) return { ok: false, error: e.account.totpWrong };
  await authLog("2fa_enabled", viewer.id, null, await clientInfo());
  refresh();
  return { ok: true, message: e.account.totpOn };
}

/** Turning 2-step off needs the password and signs the employee out everywhere. */
export async function disableTotpAction(password: string): Promise<ActionResult> {
  const e = await errorsT();
  const viewer = await getEmployee();
  if (!viewer) return { ok: false, error: e.generic.staffOnly };
  if ((await getSetting("site")).staffTotpRequired) return { ok: false, error: e.account.totpRequired };
  const row = await q1<{ password_hash: string }>("SELECT password_hash FROM employees WHERE id = ?", viewer.id);
  if (!row || !(await verifyPassword(String(password ?? ""), row.password_hash))) return { ok: false, error: e.account.passwordWrong };
  await disableTotp(viewer.id);
  await revokeAllEmployeeSessions(viewer.id);
  await authLog("2fa_disabled", viewer.id, null, await clientInfo());
  return { ok: true, message: e.account.totpOff };
}

/** The emoji shown as the employee's avatar; null goes back to the first letter of the name. */
export async function saveAvatarAction(avatar: string | null): Promise<ActionResult> {
  const e = await errorsT();
  const viewer = await getEmployee();
  if (!viewer || viewer.mustChangePassword || (await needsTotpSetup(viewer))) return { ok: false, error: e.generic.staffOnly };
  if (avatar !== null && !isAvatar(avatar)) return { ok: false, error: e.generic.invalid };
  if (!limitLocal(`avatar:${viewer.id}`, 30, 60_000).ok) return { ok: false, error: e.generic.tooFast };
  if (!(await saveAvatar(viewer.id, avatar))) return { ok: false, error: e.account.avatarNotReady };
  refresh();
  return { ok: true, message: e.account.avatarSaved };
}

/**
 * Two separate ways in: members sign in on the customer site (/login), staff on the back-office
 * console (/console). Each door only opens for its own kind of account, and each keeps its own
 * session cookie, so the customer site never sees a staff session and the reverse.
 */
export type Door = "member" | "staff";

export const doorAccepts = (door: Door, role: "member" | "staff") => door === role;

const STAFF_PATH = /^\/admin(?:[/?#][\w\-./?=&%#]*)?$/;

/** A guessed sign-in address such as /admin/login: there is no such page, the door is /console. */
export const isStaffLoginGuess = (path: string) => /^\/admin\/login(?:[/?#]|$)/.test(path);

/** Where to go after a console sign-in: a back-office page (never a sign-in address), nothing else. */
export function staffNext(value: unknown): string {
  return typeof value === "string" && STAFF_PATH.test(value) && !value.includes("..") && !isStaffLoginGuess(value) ? value.slice(0, 200) : "/admin";
}

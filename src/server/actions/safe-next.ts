const SAME_ORIGIN_PATH = /^\/(?![/\\])[\w\-./?=&%#]*$/;
const LOGIN_PATH = /^\/login(?:[/?#]|$)/;

/**
 * Where to go after signing in: a path on this site (never another origin, never the sign-in page
 * itself), otherwise the dashboard. Kept out of the "use server" module, which may only export
 * async functions.
 */
export function safeNext(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  return SAME_ORIGIN_PATH.test(s) && !LOGIN_PATH.test(s) ? s.slice(0, 200) : "/";
}

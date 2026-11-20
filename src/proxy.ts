import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from "@/i18n/config";
import { isPublicPath, sessionGate, type SessionGate } from "@/server/proxy-auth";

/** Must match EMPLOYEE_COOKIE in services/employee-auth (the `__Host-` prefix applies over HTTPS in production). */
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-cpa_session" : "cpa_session";

/** Clears a session cookie; a `__Host-` cookie only clears with the same Secure, Path=/ attributes. */
const expire = (name: string) => ({
  name,
  value: "",
  expires: new Date(0),
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
});

/** Sends visitors to /login, saying why when their session was ended (`ended`, e.g. the account signed in on another device). */
function toLogin(request: NextRequest, logicalPath: string, ended: string | null = null) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(`${logicalPath}${request.nextUrl.search}`)}${ended ? `&ended=${ended}` : ""}`;
  return NextResponse.redirect(url);
}

/**
 * Every page request passes through here.
 *
 * Language: URLs stay unprefixed (/members) and are rewritten internally to /{locale}/members, the
 * locale coming from the cp_locale cookie, then Accept-Language, then Thai. A prefixed URL (/en/members)
 * also works and remembers its language. The page's language is forwarded to the server in
 * `x-locale` so Server Actions answer in the same language.
 *
 * Access: every path except /login needs a live employee session, otherwise the visitor goes to
 * /login. Pages and actions still authorise every read and write themselves.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  const prefixed = isLocale(first);
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale: Locale = prefixed
    ? (first as Locale)
    : isLocale(cookieLocale)
      ? cookieLocale
      : (matchAcceptLanguage(request.headers.get("accept-language")) ?? DEFAULT_LOCALE);
  const logical = prefixed ? pathname.slice(first.length + 1) || "/" : pathname;

  if (!isPublicPath(logical)) {
    const token = request.cookies.get(COOKIE)?.value;
    if (!token) return toLogin(request, logical);
    let gate: SessionGate;
    try {
      gate = await sessionGate(token);
    } catch {
      return new NextResponse("Service unavailable", { status: 503, headers: { "Retry-After": "5" } });
    }
    if (!gate.ok) {
      const response = toLogin(request, logical, gate.ended);
      response.cookies.set(expire(COOKIE)); // the cookie no longer opens anything
      return response;
    }
  }

  // The sign-in page explaining why a session ended: drop that dead cookie so the note shows once.
  // Only after checking the session really is gone, so a crafted link cannot sign anyone out.
  let deadCookie: string | null = null;
  if (logical === "/login" && request.nextUrl.searchParams.has("ended")) {
    const token = request.cookies.get(COOKIE)?.value;
    if (token)
      deadCookie = await sessionGate(token)
        .then((g) => (g.ok ? null : COOKIE))
        .catch(() => null);
  }

  const target = prefixed ? null : new URL(`/${locale}${pathname}${search}`, request.url);
  const headers = new Headers(request.headers);
  headers.set("x-locale", locale);
  const response = target ? NextResponse.rewrite(target, { request: { headers } }) : NextResponse.next({ request: { headers } });
  if (cookieLocale !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 86_400, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }
  if (deadCookie) response.cookies.set(expire(deadCookie));
  return response;
}

export const config = {
  // Everything except APIs, uploaded media, Next.js internals, and metadata files.
  matcher: ["/((?!api/|media/|_next/|icon|apple-icon|favicon\\.ico|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml).*)"],
};
